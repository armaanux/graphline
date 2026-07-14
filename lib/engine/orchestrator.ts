import { nanoid } from "nanoid";
import { InvestigationGraph } from "./graph";
import { COLLECTORS } from "./collectors";
import { buildReport } from "./report";
import { enrichReportWithAI } from "./llm";
import { detectIdentifier, hostOf, identifierLabel } from "./identifier";
import { isGenericHandle, isNonPersonalHost, isProfileUrl, isRoleEmailLocal } from "./blocklist";
import { isVerifiable, tierForEntity } from "./verification";
import { webSearch, providerLabel } from "./search";
import type { Collector } from "./collector";
import type {
  Entity,
  Identifier,
  Investigation,
  Relationship,
  Report,
  StreamEvent,
} from "./types";

const TYPE_TO_ENTITY: Record<
  Identifier["type"],
  "email" | "phone" | "username" | "domain" | "website" | "person"
> = {
  email: "email",
  phone: "phone",
  username: "username",
  domain: "domain",
  url: "website",
  name: "person",
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// platforms that block direct existence checks but are search-indexed, so
// `"handle" site:x` finds the profile
const HANDLE_SOCIALS: { platform: string; domain: string }[] = [
  { platform: "Instagram", domain: "instagram.com" },
  { platform: "X / Twitter", domain: "x.com" },
  { platform: "TikTok", domain: "tiktok.com" },
  { platform: "YouTube", domain: "youtube.com" },
  { platform: "Facebook", domain: "facebook.com" },
  { platform: "Twitch", domain: "twitch.tv" },
  { platform: "Threads", domain: "threads.net" },
  { platform: "Medium", domain: "medium.com" },
  { platform: "Pinterest", domain: "pinterest.com" },
  { platform: "Snapchat", domain: "snapchat.com" },
];
// identity platforms searched by the person's real name
const NAME_SOCIALS: { platform: string; domain: string }[] = [
  { platform: "LinkedIn", domain: "linkedin.com/in" },
  { platform: "Facebook", domain: "facebook.com" },
];

interface Lead {
  identifier: Identifier;
  anchorId: string; // entity the lead was discovered from
  label: string;
  hop: number;
  score: number; // higher expands first
  terminal?: boolean; // crawl once but don't spawn further leads
}

// relationship kinds meaning the subject owns/controls the target (safe to
// crawl) vs. merely being mentioned by it
const OWNED_EDGES = new Set([
  "links_to", "publishes", "resolves_to", "operated_by", "has_account",
  "owns", "lists", "verified_same_owner", "uses_handle", "possible_account",
  "commits_as",
]);

export async function runInvestigation(
  identifier: Identifier,
  emit: (e: StreamEvent) => void
): Promise<Investigation> {
  const id = `inv_${nanoid(10)}`;
  const graph = new InvestigationGraph(emit);

  emit({ type: "meta", investigationId: id, identifier });
  emit({
    type: "status",
    message: `Opening investigation into ${identifierLabel(
      identifier.type
    ).toLowerCase()} "${identifier.raw}"`,
  });

  const seedLabel =
    identifier.type === "url"
      ? hostOf(identifier) ?? identifier.value
      : identifier.type === "name"
      ? identifier.raw
      : identifier.value;
  const seedEv = graph.addEvidence({
    sourceId: "seed",
    sourceLabel: "Your query",
    title: "Investigation subject",
    detail: `This is the ${identifierLabel(
      identifier.type
    ).toLowerCase()} you asked us to investigate.`,
    weight: 0.5,
  });
  const seedId = graph.upsertEntity({
    type: TYPE_TO_ENTITY[identifier.type],
    label: seedLabel,
    sub: identifierLabel(identifier.type),
    evidenceIds: [seedEv],
    sources: ["seed"],
  });

  const investigated = new Set<string>([`${identifier.type}:${identifier.value}`]);

  // full sweep of the seed
  const collectors = COLLECTORS.filter((c) => c.appliesTo(identifier));
  graph.note(
    "observe",
    `Searching via ${providerLabel()} plus ${collectors.length} specialised sources: ${collectors
      .map((c) => c.label)
      .join(", ")}.`
  );
  for (const c of collectors) {
    emit({ type: "source", source: { id: c.id, label: c.label, status: "pending" } });
  }
  await Promise.all(
    collectors.map(async (c, i) => {
      await delay(i * 320);
      emit({ type: "source", source: { id: c.id, label: c.label, status: "running" } });
      const started = Date.now();
      let outcome: { count: number; note?: string } = { count: 0 };
      try {
        outcome = await c.run({ identifier, seedId, graph });
      } catch {
        emit({ type: "source", source: { id: c.id, label: c.label, status: "error", note: "n/a" } });
        return;
      }
      const elapsed = Date.now() - started;
      if (elapsed < 450) await delay(450 - elapsed);
      emit({
        type: "source",
        source: {
          id: c.id,
          label: c.label,
          status: outcome.count > 0 ? "done" : "empty",
          count: outcome.count,
          note: outcome.note,
        },
      });
    })
  );

  const socialHandle =
    identifier.type === "username"
      ? identifier.value
      : identifier.type === "email"
      ? identifier.parts?.local ?? null
      : null;
  await runSocialSearch(graph, seedId, socialHandle);

  // priority frontier: expand the most promising lead next until it empties or
  // the budget is hit
  const MAX_PIVOTS = 24;
  const MAX_DEPTH = 5;
  let pivots = 0;
  const frontier: Lead[] = deriveLeads(
    graph.entities(),
    graph.relationships(),
    identifier,
    investigated,
    1
  );

  while (frontier.length && pivots < MAX_PIVOTS) {
    frontier.sort((a, b) => b.score - a.score);
    const lead = frontier.shift()!;
    const key = `${lead.identifier.type}:${lead.identifier.value}`;
    if (investigated.has(key)) continue;
    investigated.add(key);
    pivots++;

    const before = new Set(graph.entities().map((e) => e.id));
    const sourceId = `pivot:${key}`;
    emit({ type: "source", source: { id: sourceId, label: `↳ ${lead.label}`, status: "running" } });
    graph.note("infer", `Following lead: ${lead.label} (depth ${lead.hop}). Scraping for connected accounts.`);

    let count = 0;
    for (const c of collectorsForPivot(lead.identifier)) {
      try {
        count += (await c.run({ identifier: lead.identifier, seedId: lead.anchorId, graph })).count;
      } catch {
        /* one dead source shouldn't stop the crawl */
      }
    }
    emit({
      type: "source",
      source: { id: sourceId, label: `↳ ${lead.label}`, status: count > 0 ? "done" : "empty", count },
    });

    if (lead.hop < MAX_DEPTH && !lead.terminal) {
      const fresh = graph.entities().filter((e) => !before.has(e.id));
      const discovered = deriveLeads(fresh, graph.relationships(), identifier, investigated, lead.hop + 1);
      if (discovered.length)
        graph.note("observe", `${lead.label} led to ${discovered.length} new lead${discovered.length === 1 ? "" : "s"}.`);
      frontier.push(...discovered);
    }
  }
  graph.note(
    "observe",
    pivots >= MAX_PIVOTS
      ? `Reached the crawl budget after following ${pivots} leads. Connecting what was found.`
      : `Frontier exhausted after ${pivots} lead${pivots === 1 ? "" : "s"} — reached the edges of the public footprint.`
  );

  // reconcile: tier every account/link now that all sources are in
  {
    const rels = graph.relationships();
    for (const e of graph.entities()) {
      if (isVerifiable(e.type)) graph.setVerification(e.id, tierForEntity(e, rels));
    }
  }

  emit({ type: "status", message: "Connecting the dots" });
  await delay(250);

  const timeline = [...graph.timeline].sort((a, b) => a.at.localeCompare(b.at));
  const base = buildReport({
    identifier,
    entities: graph.entities(),
    relationships: graph.relationships(),
    evidence: graph.evidence(),
    notes: graph.notes,
    timeline,
  });
  let report: Report = base;
  const ai = await enrichReportWithAI({
    identifier,
    entities: graph.entities(),
    relationships: graph.relationships(),
    evidence: graph.evidence(),
    base,
  });
  if (ai) {
    report = { ...base, ...Object.fromEntries(Object.entries(ai).filter(([, v]) => v !== undefined)) };
    graph.note("infer", "AI investigator reviewed the evidence and wrote the analysis.");
  } else {
    graph.note("observe", "Analysis generated deterministically from the evidence (no AI key configured).");
  }
  emit({ type: "report", report });

  const stats = {
    sources: collectors.length + pivots,
    entities: graph.entities().length,
    evidence: graph.evidence().length,
  };
  emit({ type: "done", stats });

  return {
    id,
    query: identifier.raw,
    identifier,
    status: "complete",
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    entities: graph.entities(),
    relationships: graph.relationships(),
    evidence: graph.evidence(),
    timeline,
    report,
    notes: graph.notes,
    stats,
  };
}

/** Which collectors to run when pivoting into a discovered identifier. */
function collectorsForPivot(id: Identifier): Collector[] {
  const wanted =
    id.type === "username"
      ? ["github", "handles", "websearch"]
      : id.type === "email"
      ? ["gravatar", "handles", "websearch", "xposed"]
      : ["website", "rdap", "wayback"];
  return COLLECTORS.filter((c) => wanted.includes(c.id) && c.appliesTo(id));
}

/**
 * Turn freshly-discovered entities into scored leads. Websites are crawled
 * only if the subject owns them, not if a page merely mentions them — this
 * keeps the crawl on-target rather than drifting into unrelated pages.
 */
function deriveLeads(
  entities: Entity[],
  relationships: Relationship[],
  seed: Identifier,
  investigated: Set<string>,
  hop: number
): Lead[] {
  const leads: Lead[] = [];
  const seedHost = hostOf(seed);

  // subject's handle + high-confidence name words; a discovered site whose
  // domain contains one of these is probably the subject's
  const identityTokens = new Set<string>();
  if (seed.type === "username") identityTokens.add(seed.value.toLowerCase());
  if (seed.type === "email" && seed.parts?.local)
    identityTokens.add(seed.parts.local.toLowerCase());
  for (const e of entities)
    if (e.type === "person" && e.confidence >= 0.45)
      for (const tok of e.label.toLowerCase().split(/\s+/))
        if (tok.length >= 3) identityTokens.add(tok);

  const incomingKinds = new Map<string, string[]>();
  for (const r of relationships) {
    const arr = incomingKinds.get(r.to) ?? [];
    arr.push(r.kind);
    incomingKinds.set(r.to, arr);
  }
  const push = (l: Lead) => {
    if (!investigated.has(`${l.identifier.type}:${l.identifier.value}`)) leads.push(l);
  };

  for (const e of entities) {
    if (e.type === "website" || e.type === "domain") {
      const host = (e.attributes.URL ? safeHost(e.attributes.URL) : e.label)
        .replace(/^www\./, "")
        .toLowerCase();
      const base = host.split("/")[0];
      if (!base || base === seedHost || isNonPersonalHost(base)) continue;
      const idf = detectIdentifier(base);
      if (idf.type !== "domain" && idf.type !== "url") continue;
      // crawl only if the subject owns the site or its domain carries their
      // handle/name; a mentioning page stays a node but is not crawled
      const owned = (incomingKinds.get(e.id) ?? []).some((k) => OWNED_EDGES.has(k));
      const root = base.split(".")[0];
      const nameMatch = [...identityTokens].some(
        (t) => t.length >= 3 && (root.includes(t) || t.includes(root))
      );
      if (owned || nameMatch) {
        push({ identifier: idf, anchorId: e.id, label: base, hop, score: 1.0 + e.confidence * 0.5 - hop * 0.12 });
      }
    } else if (e.type === "email") {
      if (e.label.toLowerCase() === seed.value.toLowerCase()) continue;
      // role mailboxes belong to orgs, not people
      if (isRoleEmailLocal(e.label.split("@")[0])) continue;
      const idf = detectIdentifier(e.label);
      if (idf.type !== "email") continue;
      push({ identifier: idf, anchorId: e.id, label: e.label, hop, score: 0.9 + e.confidence * 0.4 - hop * 0.12 });
    } else if (e.type === "username") {
      if (e.label.toLowerCase() === seed.value.toLowerCase()) continue;
      if (isGenericHandle(e.label)) continue;
      const idf = detectIdentifier(e.label);
      if (idf.type !== "username") continue;
      push({ identifier: idf, anchorId: e.id, label: `@${e.label}`, hop, score: 0.7 + e.confidence * 0.4 - hop * 0.12 });
    } else if (e.type === "social_profile") {
      // a profile found through the chain (even under a different handle) is
      // worth expanding
      const owned = (incomingKinds.get(e.id) ?? []).some((k) => OWNED_EDGES.has(k));
      if (!owned) continue;
      const handle = handleOfProfile(e);
      if (!handle || handle.toLowerCase() === seed.value.toLowerCase()) continue;
      if (isGenericHandle(handle)) continue;
      const idf = detectIdentifier(handle);
      if (idf.type !== "username") continue;
      push({
        identifier: idf,
        anchorId: e.id,
        label: `@${handle}`,
        hop,
        score: 0.65 + e.confidence * 0.4 - hop * 0.12,
      });
    }
  }
  return leads;
}

const HANDLE_PATH_PREFIXES = new Set(["in", "company", "channel", "user", "profile", "u", "c", "@"]);

/** Extract a usable handle from a discovered social profile. */
function handleOfProfile(e: Entity): string | null {
  if (e.attributes.Handle) {
    const h = e.attributes.Handle.replace(/^@/, "").trim();
    if (/^[a-z0-9._-]{3,30}$/i.test(h)) return h;
  }
  const url = e.attributes.URL || `https://${e.label}`;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = e.label.includes("/") ? "/" + e.label.split("/").slice(1).join("/") : "";
  }
  const segs = path.split("/").map((s) => s.replace(/^@/, "")).filter(Boolean);
  while (segs.length && HANDLE_PATH_PREFIXES.has(segs[0].toLowerCase())) segs.shift();
  const handle = segs[0];
  if (handle && /^[a-z0-9._-]{3,30}$/i.test(handle) && !/^(posts?|reel|video|watch|status)$/i.test(handle))
    return handle;
  return null;
}

/** Use `site:` search to find social profiles by handle and by name. */
async function runSocialSearch(
  graph: InvestigationGraph,
  seedId: string,
  handle: string | null
) {
  const tasks: Promise<void>[] = [];

  if (handle && handle.length >= 3) {
    graph.note("infer", `Searching social platforms for the handle "${handle}".`);
    for (const site of HANDLE_SOCIALS) {
      tasks.push(
        siteSearch(graph, seedId, site, `"${handle}"`, {
          test: (r) =>
            r.url.toLowerCase().includes(handle.toLowerCase()) ||
            r.title.toLowerCase().includes(handle.toLowerCase()),
          reason: `handle "${handle}" appears in this ${site.platform} profile`,
          matched: { Handle: handle },
          weight: 0.5,
        })
      );
    }
  }

  const person = graph
    .entities()
    .filter((e) => e.type === "person")
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (person && person.confidence >= 0.45) {
    const name = person.label;
    const tokens = name.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    graph.note("infer", `Searching social platforms for the name "${name}".`);
    for (const site of NAME_SOCIALS) {
      tasks.push(
        siteSearch(graph, person.id, site, `"${name}"`, {
          test: (r) => {
            const hay = `${r.title} ${r.snippet}`.toLowerCase();
            return tokens.every((t) => hay.includes(t));
          },
          reason: `a ${site.platform} profile is indexed under the name "${name}"`,
          matched: { "Matched name": name },
          weight: 0.42,
        })
      );
    }
  }

  await Promise.all(tasks);
}

async function siteSearch(
  graph: InvestigationGraph,
  anchorId: string,
  site: { platform: string; domain: string },
  query: string,
  opts: {
    test: (r: { url: string; title: string; snippet: string }) => boolean;
    reason: string;
    matched: Record<string, string>;
    weight: number;
  }
): Promise<void> {
  const dom = site.domain.split("/")[0];
  const results = await webSearch(`${query} site:${site.domain}`);
  const hit = results.find(
    (r) => r.host.includes(dom) && isProfileUrl(r.url) && opts.test(r)
  );
  if (!hit) return;

  const ev = graph.addEvidence({
    sourceId: "social",
    sourceLabel: `${site.platform} (via search)`,
    title: `Possible ${site.platform} profile`,
    detail: `${hit.title || hit.url} — found because ${opts.reason}. Search matches are leads, not confirmation of ownership.`,
    url: hit.url,
    weight: opts.weight,
  });
  let label = hit.host;
  try {
    label = `${hit.host}${new URL(hit.url).pathname}`.replace(/\/+$/, "");
  } catch {}
  const sid = graph.upsertEntity({
    type: "social_profile",
    label,
    sub: site.platform,
    attributes: { URL: hit.url, ...opts.matched },
    evidenceIds: [ev],
    sources: ["social"],
  });
  graph.addRelationship({
    from: anchorId,
    to: sid,
    kind: "possible_account",
    label: `Found via search — ${opts.reason}`,
    evidenceIds: [ev],
  });
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
