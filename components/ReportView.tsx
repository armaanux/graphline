"use client";

import { ArrowUpRight, Check, HelpCircle } from "lucide-react";
import {
  ConfidenceMeter,
  RiskBadge,
  EXPOSURE_META,
  VerificationBadge,
  exposureLevelColor,
} from "@/components/primitives";
import { CountUp } from "@/components/fx";
import { Timeline } from "@/components/Timeline";
import type {
  Entity,
  ExposureBand,
  Report,
  TimelineItem,
} from "@/lib/engine/types";

const EXPOSURE_BANDS: { key: ExposureBand; label: string; span: number }[] = [
  { key: "minimal", label: "Minimal", span: 20 },
  { key: "moderate", label: "Moderate", span: 25 },
  { key: "high", label: "High", span: 25 },
  { key: "significant", label: "Significant", span: 30 },
];

function ExposureMeter({ score, band }: { score: number; band: ExposureBand }) {
  return (
    <div>
      <div className="relative flex h-2.5 overflow-hidden rounded-full">
        {EXPOSURE_BANDS.map((b) => {
          const color = EXPOSURE_META[b.key].color;
          const active = b.key === band;
          return (
            <div
              key={b.key}
              style={{
                flexBasis: `${b.span}%`,
                background: active
                  ? color
                  : `color-mix(in srgb, ${color} 15%, transparent)`,
              }}
            />
          );
        })}
        <div
          className="absolute top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-full"
          style={{
            left: `calc(${Math.min(99, Math.max(1, score))}% - 1.5px)`,
            background: "var(--color-ink)",
            boxShadow: "0 0 0 2px var(--color-bg)",
          }}
        />
      </div>
      <div className="mt-2 flex">
        {EXPOSURE_BANDS.map((b) => (
          <div key={b.key} style={{ flexBasis: `${b.span}%` }} className="text-center">
            <span
              className="label !text-[9px]"
              style={{
                color: b.key === band ? EXPOSURE_META[b.key].color : "var(--color-faint)",
              }}
            >
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t hairline py-6 first:border-t-0">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="label">{title}</h3>
        {count !== undefined && <span className="mono text-[11px] text-faint">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function LevelTag({ level }: { level: "low" | "med" | "high" }) {
  const text = level === "high" ? "High" : level === "med" ? "Med" : "Low";
  const color = exposureLevelColor(level);
  return (
    <span
      className="mt-px inline-flex w-[52px] shrink-0 items-center justify-center rounded-md border py-0.5 mono text-[10px] font-semibold uppercase tracking-wider"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 38%, var(--color-line-strong))`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {text}
    </span>
  );
}

function Pills({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-[13px] text-faint">None discovered.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i, idx) => (
        <span
          key={i + idx}
          className="rounded-md border hairline bg-surface px-2.5 py-1 mono text-[12px] text-ink"
        >
          {i}
        </span>
      ))}
    </div>
  );
}

export function ReportView({
  report,
  timeline = [],
  entities = [],
}: {
  report: Report;
  timeline?: TimelineItem[];
  entities?: Entity[];
}) {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-[26px] font-medium text-ink">Investigation Report</h2>
          <RiskBadge level={report.riskLevel} />
        </div>
        <span className="label flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: report.aiGenerated ? "var(--color-accent)" : "var(--color-faint)" }}
          />
          {report.aiGenerated ? "AI analysis" : "Deterministic"}
        </span>
      </div>

      {typeof report.exposureScore === "number" && EXPOSURE_META[report.exposureBand] && (
        <div className="mb-7 border-b border-line pb-7">
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0">
              <span className="label">Public exposure</span>
              <h3
                className="mt-2 font-display text-[26px] font-semibold leading-none"
                style={{ color: EXPOSURE_META[report.exposureBand].color }}
              >
                {EXPOSURE_META[report.exposureBand].label}
              </h3>
              <p className="mt-2 max-w-[42ch] text-[13px] leading-snug text-ink-soft">
                How discoverable this identity is from public sources.
              </p>
            </div>
            <div className="shrink-0 leading-none">
              <span
                className="font-display text-[52px] font-semibold tabular-nums"
                style={{ color: EXPOSURE_META[report.exposureBand].color }}
              >
                <CountUp value={report.exposureScore} />
              </span>
              <span className="label !text-[10px] ml-1">/ 100</span>
            </div>
          </div>

          <div className="mt-6">
            <ExposureMeter score={report.exposureScore} band={report.exposureBand} />
          </div>

          <div className="mt-7">
            <div className="label mb-3.5">What makes it discoverable</div>
            <ul className="grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
              {report.exposureFactors.slice(0, 6).map((f, i) => (
                <li key={i} className="flex items-start gap-3">
                  <LevelTag level={f.level} />
                  <p className="text-[13px] leading-snug text-ink-soft">
                    <span className="font-medium text-ink">{f.label}.</span> {f.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="rounded-xl border hairline bg-surface p-5">
        <div className="label mb-2">Executive summary</div>
        <p className="text-[15.5px] leading-relaxed text-ink">{report.executiveSummary}</p>
      </div>

      <div className="mt-4 rounded-xl border border-line-strong bg-surface-raised p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="label mb-1.5">Most likely identity</div>
            <p className="font-display text-[19px] font-medium leading-snug text-ink">
              {report.mostLikelyIdentity}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="label mb-1.5">Confidence</div>
            <ConfidenceMeter score={report.identityConfidence} />
          </div>
        </div>
      </div>

      <div className="mt-2">
        <Section title="Digital footprint">
          <ul className="space-y-1.5">
            {report.digitalFootprint.map((f, i) => (
              <li key={i} className="flex gap-2 text-[14px] leading-snug text-ink-soft">
                <span className="text-faint">—</span>
                {f}
              </li>
            ))}
          </ul>
        </Section>

        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <Section title="Associated usernames" count={report.associatedUsernames.length}>
            <Pills items={report.associatedUsernames} />
          </Section>
          <Section title="Associated websites" count={report.associatedWebsites.length}>
            <Pills items={report.associatedWebsites} />
          </Section>
          <Section title="Possible organizations" count={report.possibleOrganizations.length}>
            <Pills items={report.possibleOrganizations} />
          </Section>
          <Section title="Known accounts" count={report.knownAccounts.length}>
            {report.knownAccounts.length ? (
              <ul className="space-y-1.5">
                {report.knownAccounts.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-accent-ink hover:underline"
                    >
                      <span className="mono text-faint">{a.platform}</span>
                      <span className="truncate">{a.url.replace(/^https?:\/\//, "")}</span>
                      <ArrowUpRight size={12} className="shrink-0" />
                    </a>
                    <VerificationBadge tier={a.verification} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-faint">None discovered.</p>
            )}
          </Section>
        </div>

        {report.scamIndicators.length > 0 && (
          <Section title="Signals worth verifying" count={report.scamIndicators.length}>
            <ul className="space-y-2">
              {report.scamIndicators.map((r, i) => (
                <li
                  key={i}
                  className="flex gap-2.5 rounded-lg border-l-2 bg-surface px-3 py-2 text-[13.5px] leading-snug text-ink-soft"
                  style={{ borderColor: "var(--color-line-strong)" }}
                >
                  <span className="text-faint">•</span>
                  {r}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <Section title="Supporting evidence" count={report.supportingEvidence.length}>
            <ul className="space-y-1.5">
              {report.supportingEvidence.map((e, i) => (
                <li key={i} className="flex gap-2 text-[13.5px] leading-snug text-ink-soft">
                  <Check size={13} className="mt-0.5 shrink-0" style={{ color: "var(--color-high)" }} />
                  {e}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Conflicting / uncertain" count={report.conflictingEvidence.length}>
            <ul className="space-y-1.5">
              {report.conflictingEvidence.map((e, i) => (
                <li key={i} className="flex gap-2 text-[13.5px] leading-snug text-ink-soft">
                  <HelpCircle size={13} className="mt-0.5 shrink-0 text-faint" />
                  {e}
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {timeline.length > 0 && (
          <Section title="Timeline of discoveries" count={timeline.length}>
            <Timeline items={timeline} entities={entities} />
          </Section>
        )}

        <Section title="Why we're this confident">
          <p className="text-[14px] leading-relaxed text-ink-soft">{report.confidenceExplanation}</p>
        </Section>

        <Section title="Recommended verification steps">
          <ol className="space-y-2.5">
            {report.nextSteps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-snug text-ink">
                <span className="mono flex h-5 w-5 shrink-0 items-center justify-center rounded-full border hairline text-[11px] text-accent-ink">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}
