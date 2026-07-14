import { nanoid } from "nanoid";
import { combineConfidence } from "./confidence";
import type {
  Entity,
  EntityType,
  Evidence,
  InvestigatorNote,
  Relationship,
  StreamEvent,
  TimelineItem,
} from "./types";

type Emit = (e: StreamEvent) => void;

/** Normalize a host label so www/protocol/trailing-slash variants collapse. */
function hostKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function keyOf(type: EntityType, label: string): string {
  // a domain and the website on it are the same node — dedup them together
  if (type === "website" || type === "domain") return `site:${hostKey(label)}`;
  if (type === "social_profile") {
    // twitter.com and x.com are the same platform
    const norm = label
      .trim()
      .toLowerCase()
      .replace(/\btwitter\.com\b/g, "x.com")
      .replace(/\/+$/, "");
    return `social_profile:${norm}`;
  }
  return `${type}:${label.trim().toLowerCase()}`;
}

/**
 * Live investigation state. Collectors mutate only through these methods,
 * which enforce dedup/merge and emit a stream event per change.
 */
export class InvestigationGraph {
  private emit: Emit;
  private entitiesByKey = new Map<string, Entity>();
  private entityIdToKey = new Map<string, string>();
  private relsByKey = new Map<string, Relationship>();
  private evidenceById = new Map<string, Evidence>();
  timeline: TimelineItem[] = [];
  notes: InvestigatorNote[] = [];

  constructor(emit: Emit) {
    this.emit = emit;
  }

  addEvidence(ev: Omit<Evidence, "id">): string {
    const id = `ev_${nanoid(8)}`;
    const evidence: Evidence = { id, ...ev };
    this.evidenceById.set(id, evidence);
    this.emit({ type: "evidence", evidence });
    return id;
  }

  upsertEntity(input: {
    type: EntityType;
    label: string;
    sub?: string;
    attributes?: Record<string, string>;
    evidenceIds?: string[];
    sources?: string[];
    firstSeen?: string;
  }): string {
    const key = keyOf(input.type, input.label);
    const existing = this.entitiesByKey.get(key);

    if (existing) {
      let changed = false;
      // a "website" is more specific than a bare "domain" — upgrade in place
      if (existing.type === "domain" && input.type === "website") {
        existing.type = "website";
        existing.label = hostKey(input.label);
        changed = true;
      }
      for (const id of input.evidenceIds ?? []) {
        if (!existing.evidenceIds.includes(id)) {
          existing.evidenceIds.push(id);
          changed = true;
        }
      }
      for (const s of input.sources ?? []) {
        if (!existing.sources.includes(s)) {
          existing.sources.push(s);
          changed = true;
        }
      }
      if (input.sub && !existing.sub) {
        existing.sub = input.sub;
        changed = true;
      }
      for (const [k, v] of Object.entries(input.attributes ?? {})) {
        if (v && existing.attributes[k] !== v) {
          existing.attributes[k] = v;
          changed = true;
        }
      }
      if (input.firstSeen) {
        if (!existing.firstSeen || input.firstSeen < existing.firstSeen) {
          existing.firstSeen = input.firstSeen;
          changed = true;
        }
      }
      existing.confidence = combineConfidence(
        this.evidenceOf(existing.evidenceIds),
        existing.sources
      );
      if (changed) this.emit({ type: "entity_update", entity: existing });
      return existing.id;
    }

    const id = `en_${nanoid(8)}`;
    const entity: Entity = {
      id,
      type: input.type,
      label:
        input.type === "website" || input.type === "domain"
          ? hostKey(input.label)
          : input.label,
      sub: input.sub,
      attributes: input.attributes ?? {},
      evidenceIds: input.evidenceIds ?? [],
      sources: input.sources ?? [],
      firstSeen: input.firstSeen,
      confidence: 0,
    };
    entity.confidence = combineConfidence(
      this.evidenceOf(entity.evidenceIds),
      entity.sources
    );
    this.entitiesByKey.set(key, entity);
    this.entityIdToKey.set(id, key);
    this.emit({ type: "entity", entity });
    return id;
  }

  /** Set an entity's verification tier and re-emit it. */
  setVerification(id: string, tier: Entity["verification"]): void {
    const key = this.entityIdToKey.get(id);
    const entity = key ? this.entitiesByKey.get(key) : undefined;
    if (!entity || entity.verification === tier) return;
    entity.verification = tier;
    this.emit({ type: "entity_update", entity });
  }

  addRelationship(input: {
    from: string;
    to: string;
    kind: string;
    label: string;
    evidenceIds?: string[];
    weight?: number;
  }): string | null {
    if (!input.from || !input.to || input.from === input.to) return null;
    const key = `${input.from}|${input.kind}|${input.to}`;
    const existing = this.relsByKey.get(key);

    if (existing) {
      let changed = false;
      for (const id of input.evidenceIds ?? []) {
        if (!existing.evidenceIds.includes(id)) {
          existing.evidenceIds.push(id);
          changed = true;
        }
      }
      existing.confidence = combineConfidence(
        this.evidenceOf(existing.evidenceIds)
      );
      if (changed) this.emit({ type: "relationship", relationship: existing });
      return existing.id;
    }

    const id = `re_${nanoid(8)}`;
    const evidence = this.evidenceOf(input.evidenceIds ?? []);
    const rel: Relationship = {
      id,
      from: input.from,
      to: input.to,
      kind: input.kind,
      label: input.label,
      evidenceIds: input.evidenceIds ?? [],
      confidence:
        evidence.length > 0
          ? combineConfidence(evidence)
          : input.weight ?? 0.5,
    };
    this.relsByKey.set(key, rel);
    this.emit({ type: "relationship", relationship: rel });
    return id;
  }

  addTimeline(item: Omit<TimelineItem, "id">): void {
    const full: TimelineItem = { id: `tl_${nanoid(6)}`, ...item };
    this.timeline.push(full);
    this.emit({ type: "timeline", item: full });
  }

  note(level: InvestigatorNote["level"], message: string): void {
    const n: InvestigatorNote = {
      id: `nt_${nanoid(6)}`,
      level,
      message,
      at: new Date().toISOString(),
    };
    this.notes.push(n);
    this.emit({ type: "note", note: n });
  }

  private evidenceOf(ids: string[]): Evidence[] {
    return ids
      .map((id) => this.evidenceById.get(id))
      .filter((e): e is Evidence => Boolean(e));
  }

  entities(): Entity[] {
    return [...this.entitiesByKey.values()];
  }
  relationships(): Relationship[] {
    return [...this.relsByKey.values()];
  }
  evidence(): Evidence[] {
    return [...this.evidenceById.values()];
  }
}
