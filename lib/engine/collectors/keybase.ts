import { fetchJSON } from "../http";
import type { Collector, CollectorContext, CollectorOutcome } from "../collector";

interface KbResponse {
  status: { code: number; name: string };
  them: Array<{
    basics: { username: string };
    profile?: { full_name?: string; location?: string; bio?: string };
    proofs_summary?: {
      all: Array<{
        proof_type: string;
        nametag: string;
        service_url: string;
        proof_url: string;
        presentation_group?: string;
      }>;
    };
  }> | null;
}

/** Keybase links are cryptographically proven, so they carry high confidence. */
export const keybaseCollector: Collector = {
  id: "keybase",
  label: "Keybase",
  description: "Cryptographically-verified links between a user's accounts",
  appliesTo: (id) => id.type === "username",

  async run(ctx: CollectorContext): Promise<CollectorOutcome> {
    const { graph, seedId, identifier } = ctx;
    const res = await fetchJSON<KbResponse>(
      `https://keybase.io/_/api/1.0/user/lookup.json?usernames=${encodeURIComponent(
        identifier.value
      )}&fields=basics,profile,proofs_summary`,
      { timeoutMs: 8000 }
    );
    const them = res?.data?.them?.[0];
    if (!res || !them?.basics?.username) return { count: 0, note: "no profile" };

    let found = 0;
    const kbUrl = `https://keybase.io/${them.basics.username}`;
    const ev = graph.addEvidence({
      sourceId: "keybase",
      sourceLabel: "Keybase",
      title: "Keybase identity exists",
      detail: `A Keybase identity "${them.basics.username}" exists${
        them.profile?.full_name ? ` for ${them.profile.full_name}` : ""
      }. Keybase accounts prove ownership of linked services cryptographically.`,
      url: kbUrl,
      weight: 0.8,
    });
    found++;

    const kbId = graph.upsertEntity({
      type: "social_profile",
      label: `keybase.io/${them.basics.username}`,
      sub: "Keybase",
      attributes: pruneAttrs({
        Username: them.basics.username,
        "Full name": them.profile?.full_name ?? "",
        Location: them.profile?.location ?? "",
      }),
      evidenceIds: [ev],
      sources: ["keybase"],
    });
    graph.addRelationship({
      from: seedId,
      to: kbId,
      kind: "has_account",
      label: "This username resolves to a Keybase identity",
      evidenceIds: [ev],
    });
    graph.note(
      "observe",
      `Keybase provides cryptographic proof linking @${them.basics.username}'s accounts — these connections are high-confidence.`
    );

    if (them.profile?.full_name) {
      const pEv = graph.addEvidence({
        sourceId: "keybase",
        sourceLabel: "Keybase",
        title: "Name on Keybase",
        detail: `Keybase profile displays the name "${them.profile.full_name}".`,
        url: kbUrl,
        weight: 0.6,
      });
      const pId = graph.upsertEntity({
        type: "person",
        label: them.profile.full_name,
        sub: "Individual",
        evidenceIds: [pEv],
        sources: ["keybase"],
      });
      graph.addRelationship({
        from: kbId,
        to: pId,
        kind: "identifies",
        label: "Keybase profile is registered to this name",
        evidenceIds: [pEv],
      });
      found++;
    }

    for (const proof of them.proofs_summary?.all ?? []) {
      const eEv = graph.addEvidence({
        sourceId: "keybase",
        sourceLabel: "Keybase",
        title: `Verified ${proof.proof_type}: ${proof.nametag}`,
        detail: `Keybase cryptographically verifies that "${
          identifier.value
        }" also controls ${proof.nametag} on ${proof.proof_type.replace(
          /_/g,
          " "
        )}.`,
        url: proof.service_url || proof.proof_url,
        weight: 0.85,
      });
      let host = proof.proof_type;
      try {
        host = new URL(proof.service_url).hostname.replace(/^www\./, "");
      } catch {}
      const aId = graph.upsertEntity({
        type: "social_profile",
        label: `${host}/${proof.nametag}`,
        sub: proof.proof_type.replace(/_/g, " "),
        attributes: { Handle: proof.nametag, Verified: "Cryptographic proof" },
        evidenceIds: [eEv],
        sources: ["keybase"],
      });
      graph.addRelationship({
        from: seedId,
        to: aId,
        kind: "verified_same_owner",
        label: "Keybase cryptographically proves the same person owns this account",
        evidenceIds: [eEv],
      });
      found++;
    }

    return { count: found, note: `${found} findings` };
  },
};

function pruneAttrs(a: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v && v.trim()));
}
