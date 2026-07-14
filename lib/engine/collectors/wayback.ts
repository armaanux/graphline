import { fetchJSON, fetchText } from "../http";
import { hostOf } from "../identifier";
import type { Collector, CollectorContext, CollectorOutcome } from "../collector";

export const waybackCollector: Collector = {
  id: "wayback",
  label: "Wayback Machine",
  description: "Archive history and long-removed contact details (archive.org)",
  appliesTo: (id) => id.type === "domain" || id.type === "url",

  async run(ctx: CollectorContext): Promise<CollectorOutcome> {
    const { graph, seedId, identifier } = ctx;
    const host = hostOf(identifier);
    if (!host) return { count: 0, note: "n/a" };
    const apex = host.replace(/^www\./, "");

    const cdx = await fetchJSON<string[][]>(
      `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(
        apex
      )}&output=json&fl=timestamp,original&filter=statuscode:200&collapse=digest&limit=8`,
      { timeoutMs: 12000 }
    );
    if (
      !cdx ||
      cdx.status !== 200 ||
      !Array.isArray(cdx.data) ||
      cdx.data.length < 2
    ) {
      return { count: 0, note: "no snapshots" };
    }

    const rows = cdx.data.slice(1); // drop the column header row
    const [ts, original] = rows[0];
    if (!/^\d{8}/.test(ts)) return { count: 0, note: "no snapshots" };
    const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
    const snapUrl = `https://web.archive.org/web/${ts}/${original}`;
    let found = 0;

    const ev = graph.addEvidence({
      sourceId: "wayback",
      sourceLabel: "Wayback Machine",
      title: `Archived since ${iso}`,
      detail: `The Internet Archive's earliest capture of ${apex} is from ${iso}, so the site has existed publicly at least since then.`,
      url: snapUrl,
      observedAt: iso,
      weight: 0.5,
    });
    graph.addTimeline({
      at: iso,
      label: "First web-archive capture",
      detail: `${apex} was first archived`,
      evidenceIds: [ev],
    });
    graph.note(
      "observe",
      `${apex} has been archived since ${iso} — a lower bound on how long it has been online.`
    );
    found++;

    // Mine the earliest snapshot for emails since removed from the live site.
    // `id_` returns the raw archived page without the Wayback banner.
    const snap = await fetchText(
      `https://web.archive.org/web/${ts}id_/${original}`,
      { timeoutMs: 10000 }
    );
    if (snap && snap.ok && /html/i.test(snap.contentType)) {
      const emails = new Set<string>();
      for (const m of snap.text.matchAll(
        /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
      )) {
        const e = m[0].toLowerCase();
        if (/\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$/.test(e)) continue;
        if (/(example|sentry|wixpress|placeholder|no-?reply|@sentry)/.test(e))
          continue;
        if (/^[0-9a-f]{16,}@/.test(e)) continue;
        emails.add(e);
      }
      for (const e of [...emails].slice(0, 3)) {
        const hEv = graph.addEvidence({
          sourceId: "wayback",
          sourceLabel: "Wayback Machine",
          title: `Historical email: ${e}`,
          detail: `The email ${e} appeared on an archived (${iso}) version of ${apex}. It may be an old or since-removed contact address worth checking.`,
          url: snapUrl,
          observedAt: iso,
          weight: 0.45,
        });
        const eid = graph.upsertEntity({
          type: "email",
          label: e,
          sub: "Historical (archived)",
          evidenceIds: [hEv],
          sources: ["wayback"],
        });
        graph.addRelationship({
          from: seedId,
          to: eid,
          kind: "published_historically",
          label: `Listed on an archived version of ${apex}`,
          evidenceIds: [hEv],
        });
        found++;
      }
      if (emails.size)
        graph.note(
          "infer",
          `An archived version of ${apex} listed ${emails.size} email${
            emails.size === 1 ? "" : "s"
          } — historical contacts to verify.`
        );
    }

    return { count: found, note: `archived ${iso}` };
  },
};
