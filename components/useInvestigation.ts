"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Entity,
  Evidence,
  Identifier,
  Investigation,
  InvestigatorNote,
  Relationship,
  Report,
  SourceState,
  StreamEvent,
  TimelineItem,
} from "@/lib/engine/types";

export interface CaseData {
  investigationId?: string;
  identifier?: Identifier;
  status: "idle" | "running" | "complete" | "error";
  statusMessage: string;
  sources: SourceState[];
  entities: Entity[];
  relationships: Relationship[];
  evidence: Evidence[];
  timeline: TimelineItem[];
  notes: InvestigatorNote[];
  report?: Report;
  stats?: { sources: number; entities: number; evidence: number };
  errorMessage?: string;
  live: boolean;
}

const empty: CaseData = {
  status: "idle",
  statusMessage: "",
  sources: [],
  entities: [],
  relationships: [],
  evidence: [],
  timeline: [],
  notes: [],
  live: true,
};

function reduce(state: CaseData, e: StreamEvent): CaseData {
  switch (e.type) {
    case "meta":
      return {
        ...state,
        investigationId: e.investigationId,
        identifier: e.identifier,
        status: "running",
      };
    case "status":
      return { ...state, statusMessage: e.message };
    case "source": {
      const rest = state.sources.filter((s) => s.id !== e.source.id);
      return { ...state, sources: [...rest, e.source] };
    }
    case "entity":
      return { ...state, entities: [...state.entities, e.entity] };
    case "entity_update":
      return {
        ...state,
        entities: state.entities.map((x) =>
          x.id === e.entity.id ? e.entity : x
        ),
      };
    case "relationship": {
      const rest = state.relationships.filter((r) => r.id !== e.relationship.id);
      return { ...state, relationships: [...rest, e.relationship] };
    }
    case "evidence":
      return { ...state, evidence: [...state.evidence, e.evidence] };
    case "timeline":
      return { ...state, timeline: [...state.timeline, e.item] };
    case "note":
      return { ...state, notes: [...state.notes, e.note] };
    case "report":
      return { ...state, report: e.report };
    case "done":
      return { ...state, status: "complete", stats: e.stats, statusMessage: "" };
    case "error":
      return { ...state, status: "error", errorMessage: e.message };
    default:
      return state;
  }
}

export function useInvestigation(query: string | null): CaseData {
  const [state, setState] = useState<CaseData>({ ...empty });
  const doneRef = useRef(false);

  useEffect(() => {
    if (!query) return;
    doneRef.current = false;
    setState({ ...empty, status: "running", statusMessage: "Connecting…" });

    const es = new EventSource(
      `/api/investigate/stream?q=${encodeURIComponent(query)}`
    );

    es.onmessage = (msg) => {
      let event: StreamEvent;
      try {
        event = JSON.parse(msg.data);
      } catch {
        return;
      }
      setState((prev) => reduce(prev, event));
      if (event.type === "done" || event.type === "error") {
        doneRef.current = true;
        es.close();
      }
    };

    es.onerror = () => {
      // A clean end-of-stream close surfaces as an error; only treat it as a
      // real failure if we never reached "done".
      if (!doneRef.current) {
        setState((prev) =>
          prev.status === "complete"
            ? prev
            : {
                ...prev,
                status: "error",
                errorMessage:
                  "The connection was interrupted before the investigation finished. Please try again.",
              }
        );
        es.close();
      }
    };

    return () => {
      es.close();
    };
  }, [query]);

  return state;
}

/** Map a saved Investigation into the same shape the UI renders live. */
export function investigationToCase(inv: Investigation): CaseData {
  return {
    investigationId: inv.id,
    identifier: inv.identifier,
    status: inv.status === "running" ? "complete" : inv.status,
    statusMessage: "",
    sources: [],
    entities: inv.entities,
    relationships: inv.relationships,
    evidence: inv.evidence,
    timeline: inv.timeline,
    notes: inv.notes,
    report: inv.report,
    stats: inv.stats,
    live: false,
  };
}
