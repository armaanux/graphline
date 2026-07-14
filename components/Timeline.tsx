"use client";

import type { Entity, TimelineItem } from "@/lib/engine/types";
import { EntityIcon, entityColor } from "@/components/primitives";

function fmt(at: string): string {
  const d = new Date(at.length === 4 ? `${at}-01-01` : at);
  if (isNaN(d.getTime())) return at;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: at.length > 4 ? "numeric" : undefined,
  });
}

export function Timeline({
  items,
  entities,
}: {
  items: TimelineItem[];
  entities: Entity[];
}) {
  const sorted = [...items].sort((a, b) => a.at.localeCompare(b.at));
  if (!sorted.length) return null;

  return (
    <ol className="relative border-l hairline pl-6">
      {sorted.map((it) => {
        const ent = entities.find((e) => e.id === it.entityId);
        const color = ent ? entityColor(ent.type) : "var(--color-accent)";
        return (
          <li key={it.id} className="relative pb-6 last:pb-0">
            <span
              className="absolute -left-[31px] flex h-4 w-4 items-center justify-center rounded-full border-2 bg-bg"
              style={{ borderColor: color }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
            </span>
            <div className="mono text-[11px] uppercase tracking-wide" style={{ color }}>
              {fmt(it.at)}
            </div>
            <div className="mt-1 flex items-center gap-2">
              {ent && <EntityIcon type={ent.type} size={13} className="shrink-0" />}
              <p className="text-[14px] font-medium text-ink">{it.label}</p>
            </div>
            {it.detail && (
              <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{it.detail}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
