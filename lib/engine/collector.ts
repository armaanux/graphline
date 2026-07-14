import type { InvestigationGraph } from "./graph";
import type { Identifier } from "./types";

/**
 * One investigative technique (GitHub, WHOIS, DNS, …). Adding a source means
 * adding one object to the registry; the pipeline is unchanged.
 */
export interface Collector {
  id: string;
  label: string;
  description: string;
  /** whether this collector is relevant to the given identifier */
  appliesTo(identifier: Identifier): boolean;
  /** run the technique, writing findings into ctx.graph */
  run(ctx: CollectorContext): Promise<CollectorOutcome>;
}

export interface CollectorOutcome {
  count: number;
  /** short note shown next to the source in the UI */
  note?: string;
}

export interface CollectorContext {
  identifier: Identifier;
  /** entity id of the seed identifier */
  seedId: string;
  graph: InvestigationGraph;
}
