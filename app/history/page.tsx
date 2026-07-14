"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { TopBar } from "@/components/brand";
import { RiskBadge } from "@/components/primitives";
import { identifierLabel } from "@/lib/engine/identifier";
import type { InvestigationSummary } from "@/lib/engine/store";
import type { IdentifierType } from "@/lib/engine/types";

export default function HistoryPage() {
  const [items, setItems] = useState<InvestigationSummary[] | null>(null);

  const load = () =>
    fetch("/api/investigations")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]));

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    await fetch(`/api/investigations/${id}`, { method: "DELETE" });
    setItems((prev) => prev?.filter((i) => i.id !== id) ?? null);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        right={
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition-all hover:brightness-110"
            style={{ background: "var(--color-accent)" }}
          >
            <Plus size={14} /> New
          </Link>
        }
      />
      <main className="mx-auto w-full max-w-[900px] flex-1 px-5 py-10">
        <h1 className="font-display text-[32px] font-semibold text-ink">
          Case history
        </h1>
        <p className="mt-1 text-[14px] text-ink-soft">
          Every investigation is saved and can be revisited.
        </p>

        <div className="mt-8">
          {items === null ? (
            <p className="text-[14px] text-faint">Loading…</p>
          ) : items.length === 0 ? (
            <div className="rounded-xl border hairline bg-surface px-6 py-12 text-center">
              <p className="text-[14px] text-ink-soft">No investigations yet.</p>
              <Link href="/" className="mt-2 inline-block text-[14px] text-accent-ink hover:underline">
                Start your first investigation →
              </Link>
            </div>
          ) : (
            <ul className="divide-y hairline overflow-hidden rounded-xl border hairline bg-surface">
              {items.map((r) => (
                <li key={r.id} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-raised">
                  <Link href={`/case/${r.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="min-w-0">
                      <div className="mono text-[14px] text-ink">{r.query}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[12px] text-faint">
                        <span>{identifierLabel(r.identifierType as IdentifierType)}</span>
                        <span>·</span>
                        <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                        <span>·</span>
                        <span className="mono">{r.entities} entities</span>
                      </div>
                    </div>
                    {r.headline && (
                      <span className="ml-auto hidden max-w-[280px] truncate text-[13px] text-ink-soft md:block">
                        {r.headline}
                      </span>
                    )}
                    {r.riskLevel && <RiskBadge level={r.riskLevel} />}
                  </Link>
                  <button
                    onClick={() => remove(r.id)}
                    className="rounded-md p-1.5 text-faint opacity-0 transition-all hover:bg-surface hover:text-low group-hover:opacity-100"
                    aria-label="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
