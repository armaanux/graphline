import { webSearch, type SearchResult } from "../search";
import { hostOf } from "../identifier";
import { isProfileUrl } from "../blocklist";
import type { Collector, CollectorContext, CollectorOutcome } from "../collector";

const SOCIAL: Record<string, string> = {
  "linkedin.com": "LinkedIn",
  "twitter.com": "X / Twitter",
  "x.com": "X / Twitter",
  "instagram.com": "Instagram",
  "facebook.com": "Facebook",
  "reddit.com": "Reddit",
  "medium.com": "Medium",
  "dev.to": "Dev.to",
  "youtube.com": "YouTube",
  "tiktok.com": "TikTok",
  "github.com": "GitHub",
  "gitlab.com": "GitLab",
  "stackoverflow.com": "Stack Overflow",
  "keybase.io": "Keybase",
  "threads.net": "Threads",
  "pinterest.com": "Pinterest",
  "twitch.tv": "Twitch",
  "soundcloud.com": "SoundCloud",
  "behance.net": "Behance",
  "dribbble.com": "Dribbble",
  "producthunt.com": "Product Hunt",
  "crunchbase.com": "Crunchbase",
  "wellfound.com": "Wellfound",
  "about.me": "About.me",
  "linktr.ee": "Linktree",
  "patreon.com": "Patreon",
  "substack.com": "Substack",
  "gumroad.com": "Gumroad",
  "hashnode.dev": "Hashnode",
};

const REFERENCE = ["wikipedia.org", "britannica.com", "crunchbase.com"];

const NAME_STOP = new Set([
  "how","to","find","the","best","top","free","login","log","sign","in","email",
  "account","gmail","yahoo","outlook","phone","number","who","is","what","your",
  "my","a","an","of","and","or","for","with","review","reviews","scam","search",
  "people","lookup","address","contact","home","about","profile","page","new",
]);

function classify(r: SearchResult): {
  kind: "social" | "reference" | "document" | "website";
  platform: string;
} {
  const h = r.host;
  const social = Object.keys(SOCIAL).find((d) => h === d || h.endsWith(`.${d}`));
  if (social) return { kind: "social", platform: SOCIAL[social] };
  if (/\.pdf($|\?)/i.test(r.url)) return { kind: "document", platform: h };
  if (REFERENCE.some((d) => h.endsWith(d)))
    return { kind: "reference", platform: h };
  return { kind: "website", platform: h };
}

function cleanLabel(s: string): string {
  return s
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s*[|·—–-]\s*(Wikipedia|Britannica|LinkedIn).*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 52);
}

function nameFromTitle(title: string): string | null {
  const segments = title.split(/[–—|·:\-·(]/);
  for (const seg of segments) {
    const words = seg.trim().split(/\s+/);
    if (words.length < 2 || words.length > 3) continue;
    const ok = words.every((w) => /^[A-Z][a-z'’]{1,}$/.test(w));
    if (!ok) continue;
    if (words.some((w) => NAME_STOP.has(w.toLowerCase()))) continue;
    return words.join(" ");
  }
  return null;
}

function queriesFor(id: CollectorContext["identifier"]): string[] {
  if (id.type === "email") {
    const local = id.parts?.local;
    return local && local.length >= 4 ? [`"${id.value}"`, local] : [`"${id.value}"`];
  }
  if (id.type === "username") return [`"${id.value}"`];
  if (id.type === "phone") return [`"${id.raw}"`];
  if (id.type === "name") return [`"${id.raw}"`];
  if (id.type === "url") return [hostOf(id) ?? id.value];
  return [id.value];
}

/** Terms a result must contain to count; null => no filter. */
function needlesFor(id: CollectorContext["identifier"]): string[] | null {
  if (id.type === "email")
    return [id.value, id.parts?.local ?? ""].filter((s) => s.length >= 4);
  if (id.type === "username") return [id.value];
  if (id.type === "phone") return [id.value.replace(/\D/g, "")];
  if (id.type === "name") return [id.value];
  return null;
}

export const websearchCollector: Collector = {
  id: "websearch",
  label: "Web search",
  description: "Searches the open web for pages that reference this identifier",
  appliesTo: () => true,

  async run(ctx: CollectorContext): Promise<CollectorOutcome> {
    const { graph, seedId, identifier } = ctx;

    const queries = queriesFor(identifier);
    const batches = await Promise.all(queries.map((q) => webSearch(q)));
    const merged: SearchResult[] = [];
    const seenUrls = new Set<string>();
    for (const r of batches.flat()) {
      const key = r.url.replace(/[#?].*$/, "");
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);
      merged.push(r);
    }

    // Keep only pages that actually reference the identifier.
    const needles = needlesFor(identifier);
    const relevant = (r: SearchResult) => {
      if (!needles) return true;
      const hay = `${r.title} ${r.snippet} ${r.url}`.toLowerCase();
      return needles.some((n) => hay.includes(n.toLowerCase()));
    };
    const results = merged.filter(relevant);

    if (!results.length) {
      graph.note(
        "caution",
        merged.length
          ? "Web search found pages, but none that actually reference this identifier — so nothing was added. This keeps the report honest rather than padding it with unrelated results."
          : "Web search returned no results (the free backend may be rate-limiting). Findings rely on the other sources."
      );
      return { count: 0, note: "no matches" };
    }

    const ownHost = hostOf(identifier);
    const nameVotes = new Map<string, number>();
    let found = 0;
    const top = results.slice(0, 14);

    for (const r of top) {
      const { kind, platform } = classify(r);
      // A "social" result that isn't a profile URL is a content page, not an account.
      if (kind === "social" && !isProfileUrl(r.url)) continue;
      const ev = graph.addEvidence({
        sourceId: "websearch",
        sourceLabel: `Web · ${platform}`,
        title: `Appears on ${platform}`,
        detail: `${r.title}${r.snippet ? ` — ${r.snippet}` : ""}`.slice(0, 400),
        url: r.url,
        weight: kind === "social" ? 0.5 : 0.38,
      });
      found++;

      const nm = nameFromTitle(r.title);
      if (nm) nameVotes.set(nm, (nameVotes.get(nm) ?? 0) + 1);

      let entityId: string;
      if (kind === "social") {
        let label = `${r.host}`;
        try {
          const u = new URL(r.url);
          label = `${r.host}${u.pathname}`.replace(/\/+$/, "");
        } catch {}
        entityId = graph.upsertEntity({
          type: "social_profile",
          label,
          sub: platform,
          attributes: { URL: r.url },
          evidenceIds: [ev],
          sources: ["websearch"],
        });
        graph.addRelationship({
          from: seedId,
          to: entityId,
          kind: "appears_on",
          label: `Web search surfaced this ${platform} page referencing the identifier`,
          evidenceIds: [ev],
        });
      } else if (kind === "document" || kind === "reference") {
        entityId = graph.upsertEntity({
          type: "document",
          label: cleanLabel(r.title) || r.host,
          sub: kind === "document" ? "Public document" : platform,
          attributes: { Source: r.host, URL: r.url },
          evidenceIds: [ev],
          sources: ["websearch"],
        });
        graph.addRelationship({
          from: seedId,
          to: entityId,
          kind: "mentioned_in",
          label: `The identifier is mentioned in this ${
            kind === "document" ? "document" : "reference page"
          }`,
          evidenceIds: [ev],
        });
      } else {
        if (ownHost && (r.host === ownHost || r.host.endsWith(`.${ownHost}`)))
          continue;
        entityId = graph.upsertEntity({
          type: "website",
          label: r.host,
          sub: "Mentions the identifier",
          attributes: { Page: r.title, URL: r.url },
          evidenceIds: [ev],
          sources: ["websearch"],
        });
        graph.addRelationship({
          from: seedId,
          to: entityId,
          kind: "mentioned_on",
          label: "This site's page references the identifier (web search)",
          evidenceIds: [ev],
        });
      }
    }

    const bestName = [...nameVotes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (bestName && (bestName[1] >= 2 || identifier.type === "username")) {
      const [name, votes] = bestName;
      const nmEv = graph.addEvidence({
        sourceId: "websearch",
        sourceLabel: "Web search",
        title: `Possible name: ${name}`,
        detail: `The name "${name}" appears in ${votes} web result title${
          votes === 1 ? "" : "s"
        } alongside the identifier. This is a lead from co-occurrence, not a confirmation.`,
        weight: Math.min(0.5, 0.28 + 0.12 * votes),
      });
      const pid = graph.upsertEntity({
        type: "person",
        label: name,
        sub: "Possible identity",
        evidenceIds: [nmEv],
        sources: ["websearch"],
      });
      graph.addRelationship({
        from: seedId,
        to: pid,
        kind: "possibly_identifies",
        label: `Name appears alongside the identifier in ${votes} web result${
          votes === 1 ? "" : "s"
        }`,
        evidenceIds: [nmEv],
      });
      found++;
      graph.note(
        "infer",
        `Web results repeatedly show the name "${name}" next to this identifier — a candidate identity to verify.`
      );
    }

    graph.note(
      "observe",
      `Web search found ${found} public page${
        found === 1 ? "" : "s"
      } referencing the identifier.`
    );
    return { count: found, note: `${found} pages` };
  },
};
