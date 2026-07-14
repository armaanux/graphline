import type { Entity, Relationship, VerificationTier } from "./types";

/* Corroboration tiering: confidence measures evidence strength, verification
 * measures whether it's really the subject's. A handle on 20 platforms is 20
 * facts and 20 unverified owners. */

// sources that are themselves ownership proofs
const VERIFIED_SOURCES = new Set(["keybase", "gravatar"]);

// kinds where the subject's own verified surface claims this (rel=me, a link
// from their site, a Keybase proof). "has_account"/"appears_on" are existence
// only — the handle is taken, owner unknown.
const OWNED_CLAIM_KINDS = new Set([
  "verified_same_owner",
  "links_to",
  "publishes",
  "lists",
  "uses_handle",
  "commits_as",
]);

/** Entity types whose ownership is worth tiering. */
export function isVerifiable(type: Entity["type"]): boolean {
  return (
    type === "social_profile" ||
    type === "email" ||
    type === "website" ||
    type === "username"
  );
}

function verificationTier(
  sources: string[],
  incomingKinds: string[]
): VerificationTier {
  const verifiedSrc = sources.some((s) => VERIFIED_SOURCES.has(s));
  const ownedClaim = incomingKinds.some((k) => OWNED_CLAIM_KINDS.has(k));
  if (verifiedSrc || ownedClaim) return "confirmed";
  if (new Set(sources).size >= 2) return "likely";
  return "unverified";
}

export function tierForEntity(
  entity: Entity,
  relationships: Relationship[]
): VerificationTier {
  const incoming = relationships
    .filter((r) => r.to === entity.id || r.from === entity.id)
    .map((r) => r.kind);
  return verificationTier(entity.sources, incoming);
}
