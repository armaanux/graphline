"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  ScanSearch,
  Waypoints,
  Network,
} from "lucide-react";
import { Wordmark } from "@/components/brand";
import { EntityIcon, entityColor } from "@/components/primitives";
import { detectIdentifier, identifierLabel } from "@/lib/engine/identifier";
import type { InvestigationSummary } from "@/lib/engine/store";
import type { EntityType, IdentifierType } from "@/lib/engine/types";

const Dither = dynamic(() => import("@/components/Dither"), { ssr: false });

const EXAMPLES = ["torvalds", "beau@dropbox.com", "stripe.com", "Ada Lovelace"];

const STEPS = [
  {
    icon: ScanSearch,
    title: "Detect",
    body: "Paste anything — an email, handle, phone, name, or domain. Graphline recognizes what it is on its own.",
  },
  {
    icon: Waypoints,
    title: "Crawl",
    body: "It expands node by node across public sources, following every lead — even handles that differ from what you typed.",
  },
  {
    icon: Network,
    title: "Map",
    body: "Findings assemble into a live evidence graph and a sourced report, with a confidence score on every link.",
  },
];

const chip = (t: IdentifierType): EntityType =>
  t === "url" ? "website" : t === "name" ? "person" : (t as EntityType);

export default function Home() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [recent, setRecent] = useState<InvestigationSummary[] | null>(null);

  const detected = useMemo(
    () => (value.trim() ? detectIdentifier(value) : null),
    [value]
  );

  useEffect(() => {
    fetch("/api/investigations")
      .then((r) => r.json())
      .then((d) => setRecent(d.items ?? []))
      .catch(() => setRecent([]));
  }, []);

  const submit = (q: string) => {
    const query = q.trim();
    if (query) router.push(`/investigate?q=${encodeURIComponent(query)}`);
  };

  const accent = detected ? entityColor(chip(detected.type)) : undefined;

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="fixed inset-0 z-0" aria-hidden>
        <Dither />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(125% 90% at 50% 42%, rgba(12,12,14,0.58) 0%, rgba(12,12,14,0.30) 55%, rgba(12,12,14,0.5) 100%)",
          }}
        />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Wordmark className="h-[18px]" />
        <Link href="/history" className="label transition-colors hover:text-ink">
          History
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-5 sm:px-8">
        <section className="flex flex-col items-center py-14 text-center sm:py-20">
          <div className="animate-rise flex flex-col items-center">
            <span className="label inline-flex items-center gap-2">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--color-accent)" }}
              />
              Open-source intelligence
            </span>
            <h1 className="mt-5 font-display text-[clamp(2.3rem,7vw,4rem)] font-semibold leading-[1.03] tracking-tight text-ink">
              See the digital footprint
              <br className="hidden sm:block" /> behind anyone.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft sm:text-[16.5px]">
              Enter an email, phone, username, name, or domain. Graphline crawls
              public sources account by account, maps the evidence, and shows
              who&rsquo;s behind it — or scan yourself to see what&rsquo;s exposed.
            </p>
          </div>

          <div
            className="animate-rise mt-9 w-full max-w-xl"
            style={{ animationDelay: "70ms" }}
          >
            <div
              className="group relative flex items-center gap-3 rounded-2xl border bg-surface-raised/80 py-2 pl-4 pr-2 text-left backdrop-blur-sm transition-all duration-300 focus-within:shadow-[0_0_0_4px_var(--color-accent-soft)]"
              style={{
                borderColor: detected
                  ? "color-mix(in srgb, var(--color-accent) 45%, var(--color-line-strong))"
                  : "var(--color-line-strong)",
              }}
            >
              <span
                className="shrink-0 pl-1 transition-colors duration-300"
                style={{ color: accent ?? "var(--color-faint)" }}
              >
                {detected ? (
                  <EntityIcon type={chip(detected.type)} size={19} />
                ) : (
                  <Search size={19} />
                )}
              </span>

              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit(value)}
                placeholder="jane@example.com, @handle, Ada Lovelace…"
                className="h-11 w-full min-w-0 bg-transparent text-[15.5px] text-ink outline-none placeholder:text-faint"
                spellCheck={false}
                autoComplete="off"
              />

              {detected && (
                <span
                  className="animate-fade-in hidden shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium sm:flex"
                  style={{ color: accent }}
                >
                  <EntityIcon type={chip(detected.type)} size={12} />
                  {identifierLabel(detected.type)}
                </span>
              )}

              <button
                onClick={() => submit(value)}
                disabled={!value.trim()}
                aria-label="Trace"
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-4 text-[14px] font-medium text-white transition-all duration-200 hover:brightness-110 disabled:opacity-30"
                style={{ background: "var(--color-accent)" }}
              >
                <span className="hidden sm:inline">Trace</span>
                <ArrowRight size={16} />
              </button>
            </div>

            <div className="mt-4 flex min-h-[26px] flex-wrap items-center justify-center gap-2">
              <span className="label !tracking-normal !normal-case !text-faint">
                Try
              </span>
              {EXAMPLES.map((ex) => {
                const t = detectIdentifier(ex);
                return (
                  <button
                    key={ex}
                    onClick={() => submit(ex)}
                    className="hairline flex items-center gap-1.5 rounded-full border bg-surface/60 px-3 py-1 mono text-[12px] text-ink-soft backdrop-blur-sm transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {t && (
                      <EntityIcon
                        type={chip(t.type)}
                        size={12}
                        className="text-faint"
                      />
                    )}
                    {ex}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="w-full border-t hairline py-12">
          <div className="grid gap-9 text-center sm:grid-cols-3 sm:gap-6">
            {STEPS.map((s, i) => (
              <div key={s.title} className="flex flex-col items-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border hairline bg-surface text-ink-soft">
                  <s.icon size={18} strokeWidth={1.9} />
                </span>
                <h3 className="mt-4 font-display text-[15px] font-semibold text-ink">
                  <span className="mono mr-1.5 text-faint">0{i + 1}</span>
                  {s.title}
                </h3>
                <p className="mt-1.5 max-w-[15rem] text-[13.5px] leading-relaxed text-ink-soft">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {recent && recent.length > 0 && (
          <section className="animate-fade-in w-full border-t hairline py-10">
            <div className="mb-3 flex items-center justify-between">
              <span className="label">Recent investigations</span>
              <Link
                href="/history"
                className="label flex items-center gap-1 transition-colors hover:text-ink"
              >
                All <ArrowUpRight size={12} />
              </Link>
            </div>
            <ul className="grid gap-2 sm:grid-cols-3">
              {recent.slice(0, 3).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/case/${r.id}`}
                    className="hairline flex items-center gap-3 rounded-xl border bg-surface/70 px-4 py-3 backdrop-blur-sm transition-colors hover:border-line-strong hover:bg-surface-raised"
                  >
                    <EntityIcon
                      type={chip(r.identifierType as IdentifierType)}
                      size={14}
                      className="shrink-0 text-faint"
                    />
                    <span className="truncate mono text-[13px] text-ink">
                      {r.query}
                    </span>
                    <span className="ml-auto shrink-0 mono text-[11px] text-faint">
                      {r.entities} nodes
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-8 pt-6 text-center sm:px-8">
        <p className="mx-auto max-w-xl text-[11.5px] leading-relaxed text-faint">
          Public information only. Graphline is an investigation assistant, not a
          background-check service or people database — findings are leads to
          verify, not verdicts.
        </p>
      </footer>
    </div>
  );
}
