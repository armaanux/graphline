/* Data model. Three primitives: Evidence (an observed fact tied to a source),
 * Entity (a discovered thing), Relationship (a link between two entities).
 * Everything shown in the UI traces back to an Evidence. */

export type IdentifierType =
  | "email"
  | "phone"
  | "username"
  | "domain"
  | "url"
  | "name";

export interface Identifier {
  type: IdentifierType;
  /** the raw value the user typed */
  raw: string;
  /** normalized canonical form used for lookups */
  value: string;
  /** parsed parts, e.g. email -> {local, domain} */
  parts?: Record<string, string>;
}

export type EntityType =
  | "person"
  | "email"
  | "phone"
  | "username"
  | "domain"
  | "website"
  | "organization"
  | "social_profile"
  | "repository"
  | "document"
  | "risk";

export type ConfidenceBand = "high" | "medium" | "low";

/**
 * How well an account/link is tied to the subject, independent of confidence.
 * confirmed = ownership proof (Keybase, Gravatar, rel=me / own site);
 * likely = multiple independent sources agree;
 * unverified = the handle exists on a platform, owner unconfirmed.
 */
export type VerificationTier = "confirmed" | "likely" | "unverified";

/** A single observed fact — the atomic unit of trust. */
export interface Evidence {
  id: string;
  /** collector that produced it, e.g. "github" */
  sourceId: string;
  /** human label, e.g. "GitHub API" */
  sourceLabel: string;
  title: string;
  detail: string;
  /** URL a human can open to verify this */
  url?: string;
  /** ISO timestamp the fact refers to, not when it was fetched */
  observedAt?: string;
  /** strength of this single observation, 0..1 */
  weight: number;
}

export interface Entity {
  id: string;
  type: EntityType;
  /** primary display value, e.g. "octocat" or "jane@acme.com" */
  label: string;
  /** optional secondary line, e.g. a real name for a username */
  sub?: string;
  attributes: Record<string, string>;
  evidenceIds: string[];
  /** collector ids that independently surfaced this entity */
  sources: string[];
  confidence: number;
  /** how well this entity is tied to the subject */
  verification?: VerificationTier;
  /** earliest date associated with this entity, ISO */
  firstSeen?: string;
}

export interface Relationship {
  id: string;
  from: string; // entity id
  to: string; // entity id
  /** machine kind, e.g. "links_to", "registered_by" */
  kind: string;
  /** human sentence explaining the link */
  label: string;
  evidenceIds: string[];
  confidence: number;
}

export interface TimelineItem {
  id: string;
  /** ISO date or bare year */
  at: string;
  label: string;
  detail?: string;
  entityId?: string;
  evidenceIds: string[];
}

export type RiskLevel = "clear" | "low" | "elevated" | "high";

export type ExposureBand = "minimal" | "moderate" | "high" | "significant";

export interface ExposureFactor {
  label: string;
  detail: string;
  level: "low" | "med" | "high";
}

export interface Report {
  executiveSummary: string;
  mostLikelyIdentity: string;
  identityConfidence: number;
  /** 0–100 "how publicly discoverable is this identity" score */
  exposureScore: number;
  exposureBand: ExposureBand;
  exposureFactors: ExposureFactor[];
  digitalFootprint: string[];
  associatedUsernames: string[];
  associatedWebsites: string[];
  possibleOrganizations: string[];
  knownAccounts: { platform: string; url: string; verification: VerificationTier }[];
  riskLevel: RiskLevel;
  scamIndicators: string[];
  supportingEvidence: string[];
  conflictingEvidence: string[];
  confidenceExplanation: string;
  nextSteps: string[];
  /** true when written by the AI investigator, false for deterministic fallback */
  aiGenerated: boolean;
}

export interface Investigation {
  id: string;
  query: string;
  identifier: Identifier;
  status: "running" | "complete" | "error";
  createdAt: string;
  completedAt?: string;
  entities: Entity[];
  relationships: Relationship[];
  evidence: Evidence[];
  timeline: TimelineItem[];
  report?: Report;
  /** rolling investigator narration, oldest first */
  notes: InvestigatorNote[];
  stats?: { sources: number; entities: number; evidence: number };
}

export interface InvestigatorNote {
  id: string;
  level: "observe" | "infer" | "caution";
  message: string;
  at: string;
}

export type SourceStatus = "pending" | "running" | "done" | "empty" | "error";

export interface SourceState {
  id: string;
  label: string;
  status: SourceStatus;
  count?: number;
  note?: string;
}

export type StreamEvent =
  | { type: "meta"; investigationId: string; identifier: Identifier }
  | { type: "status"; message: string }
  | { type: "source"; source: SourceState }
  | { type: "entity"; entity: Entity }
  | { type: "entity_update"; entity: Entity }
  | { type: "relationship"; relationship: Relationship }
  | { type: "evidence"; evidence: Evidence }
  | { type: "timeline"; item: TimelineItem }
  | { type: "note"; note: InvestigatorNote }
  | { type: "report"; report: Report }
  | {
      type: "done";
      stats: { sources: number; entities: number; evidence: number };
    }
  | { type: "error"; message: string };
