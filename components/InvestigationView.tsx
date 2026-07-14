"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { TopBar } from "@/components/brand";
import { SourceRail } from "@/components/SourceRail";
import { EvidenceGraph } from "@/components/graph/EvidenceGraph";
import { NodeDrawer } from "@/components/graph/NodeDrawer";
import { ReportView } from "@/components/ReportView";
import { EvidenceList } from "@/components/EvidenceList";
import { EntityIcon } from "@/components/primitives";
import { CountUp } from "@/components/fx";
import { identifierLabel } from "@/lib/engine/identifier";
import { exportMarkdown, exportJSON } from "@/lib/export";
import type { CaseData } from "@/components/useInvestigation";
import type { EntityType, IdentifierType } from "@/lib/engine/types";

type Tab = "graph" | "report" | "evidence";

const chip = (t: IdentifierType): EntityType =>
  t === "url" ? "website" : t === "name" ? "person" : (t as EntityType);

export function InvestigationView({ data }: { data: CaseData }) {
  const [tab, setTab] = useState<Tab>("graph");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const switchedRef = useRef(false);
  const [exportOpen, setExportOpen] = useState(false);

  const seedId = useMemo(
    () =>
      data.entities.find((e) => e.sources.includes("seed"))?.id ??
      data.entities[0]?.id,
    [data.entities]
  );
  const selected = data.entities.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    if (data.report && !switchedRef.current && data.live) {
      switchedRef.current = true;
      setTab("report");
    }
  }, [data.report, data.live]);

  const running = data.status === "running";
  const entityCount = data.stats?.entities ?? data.entities.length;
  const evidenceCount = data.stats?.evidence ?? data.evidence.length;

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        right={
          <>
            <div className="hidden items-center gap-2 md:flex">
              <StatusDot status={data.status} />
              <span className="mono text-[12px] text-ink-soft">
                <CountUp value={entityCount} /> nodes · <CountUp value={evidenceCount} /> evidence
              </span>
            </div>
            {data.report && (
              <div className="relative">
                <button
                  onClick={() => setExportOpen((o) => !o)}
                  className="flex items-center gap-1.5 rounded-lg border hairline px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-line-strong hover:bg-surface"
                >
                  Export <ChevronDown size={13} />
                </button>
                {exportOpen && (
                  <div
                    className="absolute right-0 top-full z-40 mt-1 w-52 overflow-hidden rounded-lg border hairline bg-surface-raised shadow-2xl"
                    onMouseLeave={() => setExportOpen(false)}
                  >
                    <button
                      className="block w-full px-3 py-2 text-left text-[13px] text-ink hover:bg-elevated"
                      onClick={() => {
                        exportMarkdown(data);
                        setExportOpen(false);
                      }}
                    >
                      Report as Markdown
                    </button>
                    <button
                      className="block w-full border-t hairline px-3 py-2 text-left text-[13px] text-ink hover:bg-elevated"
                      onClick={() => {
                        exportJSON(data);
                        setExportOpen(false);
                      }}
                    >
                      Full case as JSON
                    </button>
                  </div>
                )}
              </div>
            )}
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition-all hover:brightness-110"
              style={{ background: "var(--color-accent)" }}
            >
              <Plus size={14} /> New
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b hairline bg-bg-2 px-4 py-2.5 sm:px-5">
        {data.identifier && (
          <span className="inline-flex items-center gap-1.5 rounded-md border hairline bg-surface px-2 py-1 text-[12px] text-ink-soft">
            <EntityIcon type={chip(data.identifier.type)} size={12} style={{ color: "var(--color-accent)" }} />
            {identifierLabel(data.identifier.type)}
          </span>
        )}
        <span className="mono text-[14px] text-ink">{data.identifier?.raw}</span>
        {running && (
          <span
            className="ml-1 mono text-[11px] uppercase tracking-wide cursor-blink"
            style={{ color: "var(--color-accent)" }}
          >
            tracing
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[300px] shrink-0 border-r hairline bg-bg-2/50 lg:block">
          <SourceRail
            sources={data.sources}
            notes={data.notes}
            live={data.live && running}
            statusMessage={data.statusMessage}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1 overflow-x-auto border-b hairline px-4">
            {(
              [
                ["graph", "Evidence graph"],
                ["report", "Report"],
                ["evidence", "Evidence"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => {
                  switchedRef.current = true;
                  setTab(id);
                }}
                className={`relative px-3 py-3 text-[13.5px] transition-colors ${
                  tab === id ? "text-ink" : "text-faint hover:text-ink-soft"
                }`}
              >
                {label}
                {id === "report" && !data.report && running && (
                  <span className="ml-1.5 inline-block h-1 w-1 animate-blink rounded-full bg-accent align-middle" />
                )}
                {tab === id && (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />
                )}
              </button>
            ))}
          </div>

          <div className="relative min-h-0 flex-1">
            {tab === "graph" && (
              <div className="flex h-full">
                <div className="relative min-w-0 flex-1">
                  {data.entities.length === 0 ? (
                    <EmptyGraph running={running} />
                  ) : (
                    <EvidenceGraph
                      entities={data.entities}
                      relationships={data.relationships}
                      seedId={seedId}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                    />
                  )}
                </div>
                {selected && (
                  <>
                    <button
                      aria-label="Close panel"
                      onClick={() => setSelectedId(null)}
                      className="absolute inset-0 z-20 bg-black/40 lg:hidden"
                    />
                    <div className="absolute inset-y-0 right-0 z-30 w-full max-w-[380px] lg:relative lg:z-auto lg:w-[360px] lg:max-w-none">
                      <NodeDrawer
                        entity={selected}
                        entities={data.entities}
                        evidence={data.evidence}
                        relationships={data.relationships}
                        onClose={() => setSelectedId(null)}
                        onSelect={setSelectedId}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === "report" &&
              (data.report ? (
                <div className="h-full overflow-y-auto">
                  <ReportView
                    report={data.report}
                    timeline={data.timeline}
                    entities={data.entities}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="scan-line mx-auto mb-4 h-1 w-40 rounded-full bg-line-strong" />
                    <p className="text-[14px] text-faint">
                      {running
                        ? "Assembling the report as evidence comes in…"
                        : "No report available."}
                    </p>
                  </div>
                </div>
              ))}

            {tab === "evidence" && (
              <div className="h-full overflow-y-auto">
                <EvidenceList evidence={data.evidence} />
              </div>
            )}
          </div>
        </div>
      </div>

      {data.status === "error" && (
        <div className="border-t border-low/40 bg-low/10 px-5 py-3 text-[13px] text-low">
          {data.errorMessage ?? "The investigation encountered an error."}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: CaseData["status"] }) {
  const map = {
    idle: ["var(--color-faint)", "Idle"],
    running: ["var(--color-accent)", "Investigating"],
    complete: ["var(--color-high)", "Complete"],
    error: ["var(--color-low)", "Error"],
  } as const;
  const [color, label] = map[status];
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === "running" ? "animate-blink" : ""}`}
        style={{ background: color }}
      />
      <span className="mono text-[11px]" style={{ color }}>
        {label}
      </span>
    </span>
  );
}

function EmptyGraph({ running }: { running: boolean }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line-strong">
          <span className="h-2.5 w-2.5 animate-pulse-ring rounded-full bg-accent" />
        </div>
        <p className="text-[14px] text-faint">
          {running ? "Discovering entities…" : "No entities discovered."}
        </p>
      </div>
    </div>
  );
}
