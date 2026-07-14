import { createHash } from "crypto";
import { fetchJSON } from "../http";
import type { Collector, CollectorContext, CollectorOutcome } from "../collector";

interface GravatarProfile {
  entry: Array<{
    hash: string;
    preferredUsername?: string;
    displayName?: string;
    aboutMe?: string;
    currentLocation?: string;
    name?: { formatted?: string };
    accounts?: Array<{ domain: string; display: string; url: string; shortname?: string }>;
    urls?: Array<{ title: string; value: string }>;
    thumbnailUrl?: string;
    profileUrl?: string;
  }>;
}

export const gravatarCollector: Collector = {
  id: "gravatar",
  label: "Gravatar",
  description: "Globally-recognized avatar profile tied to an email address",
  appliesTo: (id) => id.type === "email",

  async run(ctx: CollectorContext): Promise<CollectorOutcome> {
    const { graph, seedId, identifier } = ctx;
    const email = identifier.value.trim().toLowerCase();
    const hash = createHash("sha256").update(email).digest("hex");
    // Fallback: Gravatar still serves the legacy md5-hashed JSON endpoint.
    const md5 = createHash("md5").update(email).digest("hex");

    let res = await fetchJSON<GravatarProfile>(
      `https://gravatar.com/${hash}.json`,
      { timeoutMs: 7000 }
    );
    if (!res || res.status !== 200) {
      res = await fetchJSON<GravatarProfile>(`https://gravatar.com/${md5}.json`, {
        timeoutMs: 7000,
      });
    }
    const entry = res?.data?.entry?.[0];
    if (!res || res.status !== 200 || !entry) {
      return { count: 0, note: "no profile" };
    }

    let found = 0;
    const profileUrl = entry.profileUrl ?? `https://gravatar.com/${md5}`;
    const displayName = entry.name?.formatted || entry.displayName;

    const ev = graph.addEvidence({
      sourceId: "gravatar",
      sourceLabel: "Gravatar",
      title: "Gravatar profile exists",
      detail: `This email has a public Gravatar profile${
        displayName ? ` for "${displayName}"` : ""
      }${entry.currentLocation ? `, located in ${entry.currentLocation}` : ""}.`,
      url: profileUrl,
      weight: 0.7,
    });
    found++;

    const gId = graph.upsertEntity({
      type: "social_profile",
      label: entry.preferredUsername
        ? `gravatar / ${entry.preferredUsername}`
        : "Gravatar profile",
      sub: "Gravatar",
      attributes: pruneAttrs({
        "Display name": displayName ?? "",
        Username: entry.preferredUsername ?? "",
        Location: entry.currentLocation ?? "",
        About: entry.aboutMe ?? "",
      }),
      evidenceIds: [ev],
      sources: ["gravatar"],
    });
    graph.addRelationship({
      from: seedId,
      to: gId,
      kind: "has_account",
      label: "This email is registered to a public Gravatar profile",
      evidenceIds: [ev],
    });
    graph.note(
      "observe",
      `Gravatar confirms this email belongs to a real, self-managed public profile${
        displayName ? ` for ${displayName}` : ""
      }.`
    );

    if (displayName) {
      const pEv = graph.addEvidence({
        sourceId: "gravatar",
        sourceLabel: "Gravatar",
        title: "Name on Gravatar",
        detail: `Gravatar profile displays the name "${displayName}".`,
        url: profileUrl,
        weight: 0.55,
      });
      const personId = graph.upsertEntity({
        type: "person",
        label: displayName,
        sub: "Individual",
        attributes: pruneAttrs({ Location: entry.currentLocation ?? "" }),
        evidenceIds: [pEv],
        sources: ["gravatar"],
      });
      graph.addRelationship({
        from: gId,
        to: personId,
        kind: "identifies",
        label: "Gravatar profile is registered to this name",
        evidenceIds: [pEv],
      });
      found++;
    }

    if (entry.preferredUsername) {
      const uEv = graph.addEvidence({
        sourceId: "gravatar",
        sourceLabel: "Gravatar",
        title: "Preferred username",
        detail: `The profile's preferred username is "${entry.preferredUsername}".`,
        url: profileUrl,
        weight: 0.5,
      });
      const uId = graph.upsertEntity({
        type: "username",
        label: entry.preferredUsername,
        evidenceIds: [uEv],
        sources: ["gravatar"],
      });
      graph.addRelationship({
        from: seedId,
        to: uId,
        kind: "uses_handle",
        label: "This email's owner uses this username on Gravatar",
        evidenceIds: [uEv],
      });
      found++;
    }

    for (const acct of entry.accounts ?? []) {
      const aEv = graph.addEvidence({
        sourceId: "gravatar",
        sourceLabel: "Gravatar",
        title: `Linked account: ${acct.display || acct.domain}`,
        detail: `The Gravatar owner publicly linked their ${
          acct.domain
        } account (${acct.display}).`,
        url: acct.url,
        weight: 0.6,
      });
      let host = acct.domain;
      try {
        host = new URL(acct.url).hostname.replace(/^www\./, "");
      } catch {}
      const aId = graph.upsertEntity({
        type: "social_profile",
        label: `${host}/${acct.shortname ?? acct.display}`.replace(/\/+$/, ""),
        sub: acct.domain,
        attributes: pruneAttrs({ Account: acct.display, URL: acct.url }),
        evidenceIds: [aEv],
        sources: ["gravatar"],
      });
      graph.addRelationship({
        from: gId,
        to: aId,
        kind: "links_to",
        label: "Owner linked this account from their Gravatar profile",
        evidenceIds: [aEv],
      });
      found++;
    }

    for (const link of entry.urls ?? []) {
      if (!link.value) continue;
      const lEv = graph.addEvidence({
        sourceId: "gravatar",
        sourceLabel: "Gravatar",
        title: `Linked site: ${link.title || link.value}`,
        detail: `The Gravatar profile links to ${link.value}.`,
        url: link.value,
        weight: 0.45,
      });
      let host = link.value;
      try {
        host = new URL(link.value).hostname.replace(/^www\./, "");
      } catch {}
      const lId = graph.upsertEntity({
        type: "website",
        label: host,
        sub: link.title || "Personal site",
        attributes: { URL: link.value },
        evidenceIds: [lEv],
        sources: ["gravatar"],
      });
      graph.addRelationship({
        from: gId,
        to: lId,
        kind: "links_to",
        label: "Linked from the Gravatar profile",
        evidenceIds: [lEv],
      });
      found++;
    }

    return { count: found, note: `${found} findings` };
  },
};

function pruneAttrs(a: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v && v.trim()));
}
