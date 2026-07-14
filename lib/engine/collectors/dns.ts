import { fetchJSON } from "../http";
import { hostOf, isFreemail } from "../identifier";
import type { Collector, CollectorContext, CollectorOutcome } from "../collector";

interface DohAnswer {
  name: string;
  type: number;
  data: string;
}
interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

async function query(name: string, type: string): Promise<DohAnswer[]> {
  const r = await fetchJSON<DohResponse>(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
      name
    )}&type=${type}`,
    { headers: { accept: "application/dns-json" }, timeoutMs: 7000 }
  );
  return r?.data?.Answer ?? [];
}

export const dnsCollector: Collector = {
  id: "dns",
  label: "DNS",
  description: "Live DNS records: hosting, mail provider and TXT verifications",
  appliesTo: (id) =>
    id.type === "domain" ||
    id.type === "url" ||
    (id.type === "email" && !isFreemail(id.parts?.domain)),

  async run(ctx: CollectorContext): Promise<CollectorOutcome> {
    const { graph, seedId, identifier } = ctx;
    const host = hostOf(identifier);
    if (!host) return { count: 0, note: "n/a" };
    const domain = host.split(".").slice(-2).join(".");

    const [a, mx, txt, ns] = await Promise.all([
      query(domain, "A"),
      query(domain, "MX"),
      query(domain, "TXT"),
      query(domain, "NS"),
    ]);

    if (a.length + mx.length + ns.length === 0) {
      return { count: 0, note: "no records" };
    }

    const domId = graph.upsertEntity({
      type: "domain",
      label: domain,
      sub: "Registered domain",
      sources: ["dns"],
    });
    if (domId !== seedId) {
      const linkEv = graph.addEvidence({
        sourceId: "dns",
        sourceLabel: "DNS",
        title: `${domain} resolves`,
        detail: `${domain} has live DNS records and is an active domain.`,
        weight: 0.6,
      });
      graph.addRelationship({
        from: seedId,
        to: domId,
        kind: "resolves_to",
        label: "Identifier is hosted on this active domain",
        evidenceIds: [linkEv],
      });
    }

    let found = 0;
    const mailProvider = classifyMail(mx.map((m) => m.data));
    const attrs: Record<string, string> = {};
    if (a.length) attrs["A record"] = a[0].data;
    if (mx.length) attrs["Mail (MX)"] = mx[0].data.replace(/\.$/, "").replace(/^\d+\s+/, "");
    if (mailProvider) attrs["Mail provider"] = mailProvider;
    if (ns.length) attrs["Nameserver"] = ns[0].data.replace(/\.$/, "");

    const ev = graph.addEvidence({
      sourceId: "dns",
      sourceLabel: "DNS",
      title: `Live DNS for ${domain}`,
      detail: [
        a.length ? `Resolves to ${a[0].data}` : null,
        mailProvider ? `email handled by ${mailProvider}` : mx.length ? "has mail servers" : null,
        ns.length ? `nameservers via ${attrs["Nameserver"]}` : null,
      ]
        .filter(Boolean)
        .join("; ") + ".",
      weight: 0.55,
    });
    found++;
    graph.upsertEntity({
      type: "domain",
      label: domain,
      attributes: attrs,
      evidenceIds: [ev],
      sources: ["dns"],
    });

    if (mailProvider) {
      graph.note(
        "observe",
        `${domain} routes email through ${mailProvider}, indicating a functioning mail setup rather than a parked domain.`
      );
    }

    // TXT verification records hint at which external services are in use.
    const verifications = txt
      .map((t) => t.data.replace(/^"|"$/g, ""))
      .filter((v) => /verification|site-verification|-domain-verification|google|facebook|stripe|atlassian/i.test(v))
      .slice(0, 4);
    for (const v of verifications) {
      const service = v.split(/[=:_-]/)[0].replace(/"/g, "").slice(0, 24);
      const tEv = graph.addEvidence({
        sourceId: "dns",
        sourceLabel: "DNS TXT",
        title: "Service verification record",
        detail: `A TXT record indicates the domain is verified with an external service (${v.slice(
          0,
          60
        )}${v.length > 60 ? "…" : ""}).`,
        weight: 0.35,
      });
      graph.upsertEntity({
        type: "domain",
        label: domain,
        attributes: { [`Uses ${service}`]: "verified via DNS" },
        evidenceIds: [tEv],
        sources: ["dns"],
      });
      found++;
    }

    return { count: found, note: mailProvider ?? "records found" };
  },
};

function classifyMail(mx: string[]): string | null {
  const joined = mx.join(" ").toLowerCase();
  if (/google|googlemail|aspmx/.test(joined)) return "Google Workspace";
  if (/outlook|protection\.outlook|microsoft/.test(joined)) return "Microsoft 365";
  if (/zoho/.test(joined)) return "Zoho Mail";
  if (/proton/.test(joined)) return "Proton Mail";
  if (/icloud|apple/.test(joined)) return "iCloud";
  if (/mailgun|sendgrid|amazonses/.test(joined)) return "transactional email service";
  return mx.length ? null : null;
}
