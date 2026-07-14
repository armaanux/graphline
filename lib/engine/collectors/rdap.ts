import { fetchJSON } from "../http";
import { hostOf, isFreemail } from "../identifier";
import type { Collector, CollectorContext, CollectorOutcome } from "../collector";

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}
interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, Array<[string, object, string, string]>];
  handle?: string;
}
interface RdapResponse {
  ldhName?: string;
  status?: string[];
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: Array<{ ldhName?: string }>;
}

function vcardValue(entity: RdapEntity, key: string): string | undefined {
  const items = entity.vcardArray?.[1] ?? [];
  const row = items.find((i) => i[0] === key);
  return row ? String(row[3]) : undefined;
}

export const rdapCollector: Collector = {
  id: "rdap",
  label: "WHOIS / RDAP",
  description: "Domain registration records: registrar, dates and status",
  appliesTo: (id) =>
    id.type === "domain" ||
    id.type === "url" ||
    (id.type === "email" && !isFreemail(id.parts?.domain)),

  async run(ctx: CollectorContext): Promise<CollectorOutcome> {
    const { graph, seedId, identifier } = ctx;
    const host = hostOf(identifier);
    if (!host) return { count: 0, note: "n/a" };
    // Registrable domain, naively taken as the last two labels.
    const domain = host.split(".").slice(-2).join(".");

    const res = await fetchJSON<RdapResponse>(
      `https://rdap.org/domain/${encodeURIComponent(domain)}`,
      { timeoutMs: 9000 }
    );
    if (!res || res.status !== 200 || !res.data?.ldhName) {
      return { count: 0, note: "no record" };
    }
    const d = res.data;
    let found = 0;

    const registrar = (d.entities ?? []).find((e) =>
      e.roles?.includes("registrar")
    );
    const registrarName =
      registrar && vcardValue(registrar, "fn")
        ? vcardValue(registrar, "fn")
        : registrar?.handle;

    const reg = d.events?.find((e) => e.eventAction === "registration");
    const exp = d.events?.find((e) => e.eventAction === "expiration");
    const changed = d.events?.find((e) => e.eventAction === "last changed");

    const ev = graph.addEvidence({
      sourceId: "rdap",
      sourceLabel: "RDAP registry",
      title: `Registration record for ${domain}`,
      detail: `${domain} is a registered domain${
        registrarName ? ` managed by ${registrarName}` : ""
      }${reg ? `, first registered ${reg.eventDate.slice(0, 10)}` : ""}.`,
      url: `https://rdap.org/domain/${domain}`,
      observedAt: reg?.eventDate,
      weight: 0.9,
    });
    found++;

    const domId = graph.upsertEntity({
      type: "domain",
      label: domain,
      sub: "Registered domain",
      attributes: pruneAttrs({
        Registrar: registrarName ?? "",
        Registered: reg?.eventDate.slice(0, 10) ?? "",
        Expires: exp?.eventDate.slice(0, 10) ?? "",
        "Last changed": changed?.eventDate.slice(0, 10) ?? "",
        Status: (d.status ?? []).slice(0, 3).join(", "),
        Nameservers: (d.nameservers ?? [])
          .map((n) => n.ldhName)
          .filter(Boolean)
          .slice(0, 2)
          .join(", "),
      }),
      evidenceIds: [ev],
      sources: ["rdap"],
      firstSeen: reg?.eventDate,
    });
    if (domId !== seedId) {
      graph.addRelationship({
        from: seedId,
        to: domId,
        kind: "resolves_to",
        label: "The identifier belongs to this registered domain",
        evidenceIds: [ev],
      });
    }

    if (reg) {
      graph.addTimeline({
        at: reg.eventDate,
        label: "Domain registered",
        detail: `${domain} first registered${
          registrarName ? ` via ${registrarName}` : ""
        }`,
        entityId: domId,
        evidenceIds: [ev],
      });
      const ageYears =
        (Date.now() - new Date(reg.eventDate).getTime()) /
        (365.25 * 24 * 3600 * 1000);
      if (ageYears < 0.5) {
        graph.note(
          "infer",
          `${domain} is a young domain (registered ${reg.eventDate.slice(
            0,
            10
          )}), so there's a short track record to corroborate it against — worth weighing when judging how established this identity is.`
        );
      } else {
        graph.note(
          "observe",
          `${domain} has an established registration history (since ${reg.eventDate.slice(
            0,
            4
          )}), consistent with a long-standing presence.`
        );
      }
    }
    if (exp) {
      graph.addTimeline({
        at: exp.eventDate,
        label: "Domain expires",
        detail: `Registration for ${domain} lapses`,
        entityId: domId,
        evidenceIds: [ev],
      });
    }

    return { count: found, note: registrarName ?? "record found" };
  },
};

function pruneAttrs(a: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v && v.trim()));
}
