import { fetchJSON } from "../http";
import { hostOf } from "../identifier";
import type { Collector, CollectorContext, CollectorOutcome } from "../collector";

interface CrtRow {
  name_value: string;
}

// Certificate transparency logs reveal subdomains an org issued certs for,
// often unlinked internal/staging services.
export const crtshCollector: Collector = {
  id: "crtsh",
  label: "Certificate transparency",
  description: "Finds subdomains via public TLS certificate logs (crt.sh)",
  appliesTo: (id) => id.type === "domain" || id.type === "url",

  async run(ctx: CollectorContext): Promise<CollectorOutcome> {
    const { graph, seedId, identifier } = ctx;
    const host = hostOf(identifier);
    if (!host) return { count: 0, note: "n/a" };
    const apex = host.replace(/^www\./, "");

    const res = await fetchJSON<CrtRow[]>(
      `https://crt.sh/?q=${encodeURIComponent(`%.${apex}`)}&output=json`,
      { timeoutMs: 12000 }
    );
    if (!res || res.status !== 200 || !Array.isArray(res.data)) {
      return { count: 0, note: "no records" };
    }

    const subs = new Set<string>();
    for (const row of res.data) {
      for (const raw of String(row.name_value ?? "").split(/\s+/)) {
        const n = raw.trim().toLowerCase().replace(/^\*\./, "");
        if (!n || n.includes("*") || !n.endsWith(apex)) continue;
        if (n === apex || n === `www.${apex}`) continue;
        subs.add(n);
      }
    }

    const list = [...subs].sort().slice(0, 10);
    if (!list.length) return { count: 0, note: "no subdomains" };

    let found = 0;
    for (const sub of list) {
      const ev = graph.addEvidence({
        sourceId: "crtsh",
        sourceLabel: "crt.sh",
        title: `Subdomain: ${sub}`,
        detail: `A public TLS certificate was issued for ${sub}, confirming this host exists under ${apex}.`,
        url: `https://crt.sh/?q=${encodeURIComponent(sub)}`,
        weight: 0.5,
      });
      const sid = graph.upsertEntity({
        type: "domain",
        label: sub,
        sub: "Subdomain (cert log)",
        attributes: { "Parent domain": apex },
        evidenceIds: [ev],
        sources: ["crtsh"],
      });
      graph.addRelationship({
        from: seedId,
        to: sid,
        kind: "subdomain_of",
        label: `Subdomain of ${apex}, seen in certificate transparency logs`,
        evidenceIds: [ev],
      });
      found++;
    }

    graph.note(
      "observe",
      `Certificate transparency logs reveal ${list.length} subdomain${
        list.length === 1 ? "" : "s"
      } under ${apex}${subs.size > list.length ? ` (of ${subs.size} total)` : ""}.`
    );
    return { count: found, note: `${list.length} subdomains` };
  },
};
