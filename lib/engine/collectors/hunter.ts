import { fetchJSON } from "../http";
import { hostOf } from "../identifier";
import type { Collector, CollectorContext, CollectorOutcome } from "../collector";

// Free tier is ~25 requests/month, so this runs only on the seed (never pivots)
// and stays dormant unless HUNTER_API_KEY is set.

interface DomainSearch {
  data?: {
    domain?: string;
    organization?: string | null;
    emails?: Array<{
      value: string;
      first_name?: string | null;
      last_name?: string | null;
      position?: string | null;
      confidence?: number | null;
      type?: string; // "personal" | "generic"
      sources?: Array<{ uri?: string }>;
    }>;
  };
}

interface Verify {
  data?: {
    email?: string;
    status?: string; // valid | invalid | accept_all | webmail | disposable | unknown
    result?: string; // deliverable | undeliverable | risky
    score?: number | null;
    sources?: Array<{ uri?: string }>;
  };
}

const KEY = () => process.env.HUNTER_API_KEY;

export const hunterCollector: Collector = {
  id: "hunter",
  label: "Hunter.io",
  description: "Professional emails on a domain, and email deliverability",
  appliesTo: (id) =>
    !!KEY() &&
    (id.type === "domain" || id.type === "url" || id.type === "email"),

  async run(ctx: CollectorContext): Promise<CollectorOutcome> {
    const key = KEY();
    if (!key) return { count: 0, note: "no key" };
    const { graph, seedId, identifier } = ctx;

    // Email seed: verify deliverability (1 call).
    if (identifier.type === "email") {
      const email = identifier.value.toLowerCase();
      const res = await fetchJSON<Verify>(
        `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(
          email
        )}&api_key=${key}`,
        { timeoutMs: 9000 }
      );
      const d = res?.data?.data;
      if (!res || res.status !== 200 || !d?.status) {
        return { count: 0, note: "no data" };
      }
      const verdict = d.result || d.status;
      const deliverable = d.result === "deliverable" || d.status === "valid";
      const srcCount = d.sources?.length ?? 0;
      const ev = graph.addEvidence({
        sourceId: "hunter",
        sourceLabel: "Hunter.io",
        title: `Email verified: ${verdict}`,
        detail: `Hunter checked ${email} and reports "${verdict}"${
          d.score != null ? ` (score ${d.score})` : ""
        }${
          srcCount ? `, seen on ${srcCount} public source${srcCount === 1 ? "" : "s"}` : ""
        }. ${
          deliverable
            ? "The address is real and accepts mail."
            : "Deliverability is uncertain."
        }`,
        url: `https://hunter.io/verify/${encodeURIComponent(email)}`,
        weight: deliverable ? 0.6 : 0.3,
      });
      graph.upsertEntity({
        type: "email",
        label: email,
        sub: deliverable ? "Verified deliverable" : undefined,
        attributes: pruneAttrs({
          Deliverability: verdict ?? "",
          "Public sources": srcCount ? String(srcCount) : "",
        }),
        evidenceIds: [ev],
        sources: ["hunter"],
      });
      graph.note(
        "observe",
        `Hunter.io verifies ${email} as ${verdict}${
          srcCount
            ? `, appearing on ${srcCount} public source${srcCount === 1 ? "" : "s"}`
            : ""
        }.`
      );
      return { count: 1, note: verdict };
    }

    // Domain/url seed: find professional emails on that domain.
    const host = hostOf(identifier);
    if (!host) return { count: 0, note: "n/a" };
    const domain = host.replace(/^www\./, "");
    const res = await fetchJSON<DomainSearch>(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(
        domain
      )}&limit=10&api_key=${key}`,
      { timeoutMs: 10000 }
    );
    const d = res?.data?.data;
    if (!res || res.status !== 200 || !d?.emails?.length) {
      return { count: 0, note: "no emails" };
    }
    let found = 0;

    const org = (d.organization ?? "").trim();
    const orgLooksPersonal =
      /^\p{Lu}[\p{L}'.-]+(?:\s+\p{Lu}[\p{L}'.-]+){1,2}$/u.test(org) &&
      !/\b(inc|llc|ltd|limited|corp|gmbh|co|company|studio|labs?|group|agency|media|technologies|technology|solutions|systems|works|collective)\b/i.test(
        org
      );
    if (org && !orgLooksPersonal) {
      const oEv = graph.addEvidence({
        sourceId: "hunter",
        sourceLabel: "Hunter.io",
        title: `Organization: ${org}`,
        detail: `Hunter attributes ${domain} to the organization "${org}".`,
        url: `https://hunter.io/domains/${encodeURIComponent(domain)}`,
        weight: 0.5,
      });
      const oId = graph.upsertEntity({
        type: "organization",
        label: org,
        evidenceIds: [oEv],
        sources: ["hunter"],
      });
      graph.addRelationship({
        from: seedId,
        to: oId,
        kind: "operated_by",
        label: `Hunter attributes ${domain} to this organization`,
        evidenceIds: [oEv],
      });
      found++;
    }

    for (const em of d.emails.slice(0, 8)) {
      if (!em.value) continue;
      const value = em.value.toLowerCase();
      const name = [em.first_name, em.last_name].filter(Boolean).join(" ").trim();
      const conf = em.confidence ?? null;
      const eEv = graph.addEvidence({
        sourceId: "hunter",
        sourceLabel: "Hunter.io",
        title: `Email on ${domain}: ${value}`,
        detail: `Hunter found ${value}${
          name ? ` (${name}${em.position ? `, ${em.position}` : ""})` : ""
        } associated with ${domain}${conf != null ? `, confidence ${conf}%` : ""}.`,
        url: `https://hunter.io/domains/${encodeURIComponent(domain)}`,
        weight: Math.min(0.7, 0.3 + (conf ?? 50) / 200),
      });
      const eId = graph.upsertEntity({
        type: "email",
        label: value,
        sub:
          em.type === "generic" ? "Role address" : em.position || undefined,
        attributes: pruneAttrs({
          Name: name,
          Position: em.position ?? "",
          Confidence: conf != null ? `${conf}%` : "",
        }),
        evidenceIds: [eEv],
        sources: ["hunter"],
      });
      graph.addRelationship({
        from: seedId,
        to: eId,
        kind: "publishes",
        label: `Hunter associates this email with ${domain}`,
        evidenceIds: [eEv],
      });
      found++;

      if (name && em.type !== "generic") {
        const pEv = graph.addEvidence({
          sourceId: "hunter",
          sourceLabel: "Hunter.io",
          title: `Name: ${name}`,
          detail: `${name}${
            em.position ? `, ${em.position},` : ""
          } is associated with ${value} at ${domain}.`,
          url: `https://hunter.io/domains/${encodeURIComponent(domain)}`,
          weight: 0.45,
        });
        const pId = graph.upsertEntity({
          type: "person",
          label: name,
          sub: em.position || "Individual",
          evidenceIds: [pEv],
          sources: ["hunter"],
        });
        graph.addRelationship({
          from: eId,
          to: pId,
          kind: "identifies",
          label: "Hunter attributes this email to this person",
          evidenceIds: [pEv],
        });
        found++;
      }
    }

    graph.note(
      "infer",
      `Hunter.io returned ${d.emails.length} professional email${
        d.emails.length === 1 ? "" : "s"
      } for ${domain}${org ? ` (${org})` : ""}.`
    );
    return { count: found, note: `${d.emails.length} emails` };
  },
};

function pruneAttrs(a: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v && v.trim()));
}
