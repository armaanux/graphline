"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Evidence } from "@/lib/engine/types";

export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  const sources = useMemo(() => {
    const m = new Map<string, string>();
    evidence.forEach((e) => m.set(e.sourceId, e.sourceLabel.replace(/^Web · /, "Web")));
    return [...m.entries()];
  }, [evidence]);
  const [filter, setFilter] = useState<string | null>(null);

  const shown = evidence
    .filter((e) => e.sourceId !== "seed")
    .filter((e) => !filter || e.sourceId === filter)
    .sort((a, b) => b.weight - a.weight);

  return (
    <div className="mx-auto max-w-[760px] px-6 py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[24px] font-medium text-ink">Evidence ledger</h2>
        <span className="label">{shown.length} items</span>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        <FilterChip active={!filter} onClick={() => setFilter(null)}>
          All
        </FilterChip>
        {sources
          .filter(([id]) => id !== "seed")
          .map(([id, label]) => (
            <FilterChip key={id} active={filter === id} onClick={() => setFilter(id)}>
              {label}
            </FilterChip>
          ))}
      </div>

      <ul className="space-y-2.5">
        {shown.map((ev) => (
          <li
            key={ev.id}
            className="rounded-xl border hairline bg-surface-raised p-4 transition-colors hover:border-line-strong"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="mono text-[10px] uppercase tracking-wide text-accent-ink">
                {ev.sourceLabel}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="label !text-[10px]">weight</span>
                <span className="h-1 w-10 overflow-hidden rounded-full bg-line-strong">
                  <span
                    className="block h-full rounded-full bg-ink-soft"
                    style={{ width: `${Math.round(ev.weight * 100)}%` }}
                  />
                </span>
              </span>
            </div>
            <p className="text-[14px] font-medium text-ink">{ev.title}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{ev.detail}</p>
            {ev.url && (
              <a
                href={ev.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-accent-ink hover:underline"
              >
                {ev.url.replace(/^https?:\/\//, "").slice(0, 60)}
                <ArrowUpRight size={12} />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
        active
          ? "border-accent bg-accent text-white"
          : "hairline text-ink-soft hover:border-line-strong hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
