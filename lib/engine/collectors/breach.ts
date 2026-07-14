import { fetchJSON } from "../http";
import type { Collector, CollectorContext, CollectorOutcome } from "../collector";

interface BreachDetail {
  breach?: string;
  xposed_date?: string;
  xposed_records?: number | string;
  xposed_data?: string;
  domain?: string;
  industry?: string;
  details?: string;
  password_risk?: string;
}

interface Analytics {
  ExposedBreaches?: { breaches_details?: BreachDetail[] };
}

export const breachCollector: Collector = {
  id: "xposed",
  label: "Breach exposure",
  description: "Checks whether the email appears in known data breaches (XposedOrNot)",
  appliesTo: (id) => id.type === "email",

  async run(ctx: CollectorContext): Promise<CollectorOutcome> {
    const { graph, seedId, identifier } = ctx;
    const email = identifier.value.toLowerCase();

    const res = await fetchJSON<Analytics>(
      `https://api.xposedornot.com/v1/breach-analytics?email=${encodeURIComponent(
        email
      )}`,
      { timeoutMs: 10000 }
    );
    const details = res?.data?.ExposedBreaches?.breaches_details;
    if (!res || res.status !== 200 || !Array.isArray(details) || !details.length) {
      return { count: 0, note: "no breaches" };
    }

    let found = 0;
    for (const b of details.slice(0, 10)) {
      if (!b.breach) continue;
      const recordsNum = Number(b.xposed_records);
      const records = Number.isFinite(recordsNum) && recordsNum > 0
        ? `${recordsNum.toLocaleString()} records`
        : "";
      const exposed = (b.xposed_data ?? "").replace(/;/g, ", ").trim();
      const year = /^\d{4}$/.test(b.xposed_date ?? "") ? b.xposed_date! : "";

      const ev = graph.addEvidence({
        sourceId: "xposed",
        sourceLabel: "XposedOrNot",
        title: `Data breach: ${b.breach}${year ? ` (${year})` : ""}`,
        detail: `${email} appears in the ${b.breach} breach${
          year ? ` (${year})` : ""
        }.${exposed ? ` Exposed data: ${exposed}.` : ""}${
          records ? ` ${records} affected.` : ""
        }`.slice(0, 400),
        url: b.domain ? `https://${b.domain}` : "https://xposedornot.com",
        observedAt: year ? `${year}-01-01` : undefined,
        weight: 0.55,
      });
      const bid = graph.upsertEntity({
        type: "risk",
        label: b.breach,
        sub: "Data breach",
        attributes: pruneAttrs({
          Date: year,
          Records: records,
          "Exposed data": exposed,
          Domain: b.domain ?? "",
        }),
        evidenceIds: [ev],
        sources: ["xposed"],
      });
      graph.addRelationship({
        from: seedId,
        to: bid,
        kind: "exposed_in",
        label: `This email was exposed in the ${b.breach} breach`,
        evidenceIds: [ev],
      });
      if (year) {
        graph.addTimeline({
          at: `${year}-01-01`,
          label: `Breach: ${b.breach}`,
          detail: `${email} exposed in the ${b.breach} breach`,
          entityId: bid,
          evidenceIds: [ev],
        });
      }
      found++;
    }

    const names = details
      .map((b) => b.breach)
      .filter(Boolean)
      .slice(0, 5)
      .join(", ");
    graph.note(
      "caution",
      `${email} appears in ${details.length} known data breach${
        details.length === 1 ? "" : "es"
      }${names ? `: ${names}${details.length > 5 ? "…" : ""}` : ""}. This is public breach-exposure data — a reason to rotate the password and enable 2FA.`
    );
    return { count: found, note: `${details.length} breaches` };
  },
};

function pruneAttrs(a: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v && v.trim()));
}
