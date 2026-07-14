"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, CircleAlert, Dot } from "lucide-react";
import type { InvestigatorNote, SourceState } from "@/lib/engine/types";

const STATUS_META: Record<
  SourceState["status"],
  { color: string; label: string; spinning?: boolean }
> = {
  pending: { color: "var(--color-faint)", label: "queued" },
  running: { color: "var(--color-accent)", label: "checking", spinning: true },
  done: { color: "var(--color-high)", label: "" },
  empty: { color: "var(--color-faint)", label: "" },
  error: { color: "var(--color-low)", label: "n/a" },
};

function NoteMark({ level }: { level: InvestigatorNote["level"] }) {
  if (level === "caution")
    return <CircleAlert size={13} className="mt-[1px]" style={{ color: "var(--color-medium)" }} />;
  if (level === "infer")
    return <ArrowRight size={13} className="mt-[1px]" style={{ color: "var(--color-info)" }} />;
  return <Dot size={16} className="-mt-[1px] -ml-[3px]" style={{ color: "var(--color-faint)" }} />;
}

export function SourceRail({
  sources,
  notes,
  live,
  statusMessage,
}: {
  sources: SourceState[];
  notes: InvestigatorNote[];
  live: boolean;
  statusMessage: string;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (live && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [notes, live]);

  const ordered = [...sources].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="flex h-full flex-col">
      {sources.length > 0 && (
        <div className="border-b hairline px-5 py-4">
          <div className="label mb-3">Sources</div>
          <ul className="space-y-1.5">
            {ordered.map((s) => {
              const m = STATUS_META[s.status];
              return (
                <li key={s.id} className="flex items-center gap-2.5 text-[13px]">
                  <span className="relative flex h-2 w-2 items-center justify-center">
                    {m.spinning && (
                      <span
                        className="absolute h-2 w-2 animate-pulse-ring rounded-full"
                        style={{ background: m.color }}
                      />
                    )}
                    <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                  </span>
                  <span className={s.status === "empty" ? "text-faint" : "text-ink"}>
                    {s.label}
                  </span>
                  <span className="ml-auto mono text-[11px] text-faint">
                    {s.status === "done" && s.count ? s.count : m.label || (s.status === "empty" ? "—" : "")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="label">Investigator log</span>
          {live && (
            <span className="flex items-center gap-1.5 mono text-[10px] uppercase tracking-wide text-accent">
              <span className="h-1.5 w-1.5 animate-blink rounded-full bg-accent" />
              live
            </span>
          )}
        </div>
        <div ref={logRef} className="mt-3 h-full overflow-y-auto px-5 pb-24">
          <ol className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="animate-rise flex gap-2">
                <NoteMark level={n.level} />
                <p className="text-[12.5px] leading-snug text-ink-soft">{n.message}</p>
              </li>
            ))}
            {live && statusMessage && (
              <li className="flex gap-2">
                <span className="mt-[1px] animate-blink mono text-[13px] text-accent">▸</span>
                <p className="text-[12.5px] italic leading-snug text-faint">{statusMessage}…</p>
              </li>
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}
