"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { EntityIcon, bandColor, entityColor } from "@/components/primitives";
import type { Entity } from "@/lib/engine/types";

export interface EntityNodeData {
  entity: Entity;
  selected: boolean;
  dimmed: boolean;
  isSeed: boolean;
  degree: number;
  [key: string]: unknown;
}

export function EntityNode({ data }: NodeProps) {
  const { entity, selected, dimmed, isSeed, degree } = data as EntityNodeData;
  const color = entityColor(entity.type);
  const scale = isSeed ? 1.16 : degree >= 4 ? 1.06 : degree >= 2 ? 1 : 0.93;
  // Unverified accounts get a dashed outline so they read as candidate, not fact.
  const unverified = entity.verification === "unverified";

  return (
    <div
      className="animate-rise transition-opacity duration-300"
      style={{
        opacity: dimmed ? 0.2 : unverified && !selected ? 0.68 : 1,
        fontSize: `${scale}rem`,
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <div
        className="relative flex items-center gap-2 overflow-hidden rounded-[11px] border py-2 pl-3 pr-3"
        style={{
          background: "var(--color-surface-raised)",
          borderStyle: unverified ? "dashed" : "solid",
          borderColor: selected
            ? "var(--color-accent)"
            : isSeed
            ? "var(--color-line-strong)"
            : unverified
            ? "var(--color-line-strong)"
            : "var(--color-line)",
          boxShadow: selected
            ? "0 0 0 1px var(--color-accent)"
            : "0 4px 14px -10px rgba(0,0,0,0.7)",
          minWidth: isSeed ? 148 : 122,
          maxWidth: 210,
        }}
      >
        <span
          className="absolute inset-y-0 left-0 w-[2.5px]"
          style={{ background: isSeed ? "var(--color-accent)" : color }}
        />
        <span
          className="flex h-[1.7em] w-[1.7em] shrink-0 items-center justify-center rounded-[8px]"
          style={{
            background: `color-mix(in srgb, ${color} 24%, var(--color-surface-raised))`,
            color,
          }}
        >
          <EntityIcon type={entity.type} size={Math.round(15 * scale)} />
        </span>
        <div className="min-w-0">
          <div
            className={`truncate leading-tight text-ink ${
              isSeed ? "font-display text-[0.95em] font-medium" : "text-[0.82em] font-medium"
            }`}
            title={entity.label}
          >
            {entity.label}
          </div>
          <div className="mt-[1px] truncate mono uppercase" style={{ fontSize: "0.56em", letterSpacing: "0.08em", color: isSeed ? "var(--color-accent-ink)" : "var(--color-faint)" }}>
            {isSeed ? "◆ subject" : entity.sub || entity.type.replace("_", " ")}
          </div>
        </div>
        {!isSeed && (
          <span
            className="ml-auto h-[0.5em] w-[0.5em] shrink-0 rounded-full"
            style={{ background: bandColor(entity.confidence) }}
            title={`${Math.round(entity.confidence * 100)}% confidence`}
          />
        )}
      </div>
    </div>
  );
}
