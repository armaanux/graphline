"use client";

import { useMemo, type ReactNode } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { EntityNode } from "./EntityNode";
import { radialLayout } from "./layout";
import { ENTITY_LABEL, entityColor } from "@/components/primitives";
import type { Entity, EntityType, Relationship } from "@/lib/engine/types";

const nodeTypes = { entity: EntityNode };

export function EvidenceGraph({
  entities,
  relationships,
  seedId,
  selectedId,
  onSelect,
}: {
  entities: Entity[];
  relationships: Relationship[];
  seedId?: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const seed = seedId ?? entities[0]?.id ?? "";
    const pos = radialLayout(entities, relationships, seed);

    const degree = new Map<string, number>();
    for (const r of relationships) {
      degree.set(r.from, (degree.get(r.from) ?? 0) + 1);
      degree.set(r.to, (degree.get(r.to) ?? 0) + 1);
    }
    const entById = new Map(entities.map((e) => [e.id, e]));

    const neighborIds = new Set<string>();
    if (selectedId) {
      neighborIds.add(selectedId);
      for (const r of relationships) {
        if (r.from === selectedId) neighborIds.add(r.to);
        if (r.to === selectedId) neighborIds.add(r.from);
      }
    }

    const nodes: Node[] = entities.map((e) => ({
      id: e.id,
      type: "entity",
      position: pos.get(e.id) ?? { x: 0, y: 0 },
      data: {
        entity: e,
        selected: selectedId === e.id,
        dimmed: selectedId ? !neighborIds.has(e.id) : false,
        isSeed: e.id === seed,
        degree: degree.get(e.id) ?? 0,
      },
      draggable: true,
    }));

    const selectedColor = selectedId
      ? entityColor(entById.get(selectedId)?.type ?? "person")
      : "var(--color-line-strong)";
    const edges: Edge[] = relationships.map((r) => {
      const active = selectedId && (r.from === selectedId || r.to === selectedId);
      // Fainter edges into unverified nodes so the corroborated core stands out.
      const weak =
        entById.get(r.to)?.verification === "unverified" ||
        entById.get(r.from)?.verification === "unverified";
      const color = active ? selectedColor : "var(--color-line-strong)";
      return {
        id: r.id,
        source: r.from,
        target: r.to,
        label: active ? r.label : undefined,
        labelStyle: { fill: "var(--color-ink-soft)", fontSize: 10, fontFamily: "Inter" },
        labelBgStyle: { fill: "var(--color-surface-raised)", fillOpacity: 0.96 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        animated: !!active,
        style: {
          stroke: color,
          strokeWidth: active ? 1.6 : weak ? 0.8 : 1.1,
          opacity: selectedId && !active ? 0.1 : weak ? 0.3 : 0.55,
        },
      };
    });

    return { nodes, edges };
  }, [entities, relationships, seedId, selectedId]);

  const typesPresent = useMemo(() => {
    const set = new Map<EntityType, number>();
    for (const e of entities) set.set(e.type, (set.get(e.type) ?? 0) + 1);
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, [entities]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      fitView
      fitViewOptions={{ padding: 0.35, maxZoom: 1.1 }}
      minZoom={0.2}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
      className="!bg-transparent"
    >
      <Background variant={BackgroundVariant.Dots} gap={30} size={1} color="var(--color-line)" />
      <Controls
        showInteractive={false}
        position="bottom-left"
        className="!border !border-line !bg-surface-raised/80 !shadow-none !backdrop-blur"
      />

      <Panel position="top-left">
        <div className="rounded-xl border hairline bg-surface-raised/80 px-3 py-2 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <span className="label !text-[10px] flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
              {entities.length} nodes
            </span>
            <span className="h-3 w-px bg-line-strong" />
            <span className="label !text-[10px]">{relationships.length} links</span>
          </div>
          <p className="mt-1 text-[10.5px] leading-tight text-faint">
            Click any node to inspect its evidence
          </p>
        </div>
      </Panel>

      <Panel position="bottom-right">
        <div className="max-w-[188px] rounded-xl border hairline bg-surface-raised/80 p-3 backdrop-blur">
          <div className="label !text-[9px] mb-2">How to read it</div>
          <div className="mb-2.5 space-y-1.5 border-b hairline pb-2.5">
            <LegendRow swatch={<Chip />} label="Confirmed owner" />
            <LegendRow swatch={<Chip dashed />} label="Same handle · unverified" />
          </div>
          <div className="label !text-[9px] mb-1.5">Entity types</div>
          <div className="grid grid-cols-1 gap-1">
            {typesPresent.map(([t, n]) => (
              <div key={t} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: entityColor(t) }} />
                <span className="truncate">{ENTITY_LABEL[t]}</span>
                <span className="ml-auto mono text-faint">{n}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </ReactFlow>
  );
}

function LegendRow({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-soft">
      {swatch}
      <span className="truncate">{label}</span>
    </div>
  );
}

function Chip({ dashed = false }: { dashed?: boolean }) {
  return (
    <span
      className={`h-3 w-4 shrink-0 rounded-[4px] border ${dashed ? "border-dashed" : ""}`}
      style={{ borderColor: "var(--color-line-strong)", background: "var(--color-surface)" }}
    />
  );
}
