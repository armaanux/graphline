"use client";

import { ExternalLink, X } from "lucide-react";
import {
  ConfidenceMeter,
  ENTITY_LABEL,
  EntityIcon,
  VerificationBadge,
  entityColor,
} from "@/components/primitives";
import type { Entity, Evidence, Relationship } from "@/lib/engine/types";

export function NodeDrawer({
  entity,
  entities,
  evidence,
  relationships,
  onClose,
  onSelect,
}: {
  entity: Entity | null;
  entities: Entity[];
  evidence: Evidence[];
  relationships: Relationship[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  if (!entity) return null;
  const color = entityColor(entity.type);
  const supporting = entity.evidenceIds
    .map((id) => evidence.find((e) => e.id === id))
    .filter((e): e is Evidence => Boolean(e));

  const links = relationships
    .filter((r) => r.from === entity.id || r.to === entity.id)
    .map((r) => {
      const otherId = r.from === entity.id ? r.to : r.from;
      const other = entities.find((e) => e.id === otherId);
      return other ? { rel: r, other } : null;
    })
    .filter((x): x is { rel: Relationship; other: Entity } => Boolean(x));

  return (
    <aside className="animate-rise flex h-full w-full flex-col border-l hairline bg-bg-2">
      <div className="flex items-start gap-3 border-b hairline px-5 py-4">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${color} 22%, var(--color-surface))`, color }}
        >
          <EntityIcon type={entity.type} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="label mb-0.5" style={{ color }}>
            {ENTITY_LABEL[entity.type]}
          </div>
          <h3 className="break-words font-display text-[17px] font-medium leading-tight text-ink">
            {entity.label}
          </h3>
          {entity.sub && <p className="mt-0.5 text-[13px] text-ink-soft">{entity.sub}</p>}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-faint transition-colors hover:bg-surface hover:text-ink"
          aria-label="Close"
        >
          <X size={17} />
        </button>
      </div>

      <div className="flex items-center justify-between border-b hairline px-5 py-3">
        <span className="label">Confidence</span>
        <ConfidenceMeter score={entity.confidence} />
      </div>

      {entity.verification && (
        <div className="flex items-center justify-between border-b hairline px-5 py-3">
          <span className="label">Ownership</span>
          <VerificationBadge tier={entity.verification} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {Object.keys(entity.attributes).length > 0 && (
          <section className="border-b hairline px-5 py-4">
            <div className="label mb-3">Attributes</div>
            <dl className="space-y-2">
              {Object.entries(entity.attributes).map(([k, v]) => (
                <div key={k} className="flex gap-3 text-[13px]">
                  <dt className="w-28 shrink-0 text-faint">{k}</dt>
                  <dd className="min-w-0 break-words text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {links.length > 0 && (
          <section className="border-b hairline px-5 py-4">
            <div className="label mb-3">Connections · {links.length}</div>
            <ul className="space-y-2.5">
              {links.map(({ rel, other }) => (
                <li key={rel.id}>
                  <button
                    onClick={() => onSelect(other.id)}
                    className="group w-full rounded-lg border hairline bg-surface px-3 py-2 text-left transition-colors hover:border-line-strong hover:bg-surface-raised"
                  >
                    <div className="flex items-center gap-2">
                      <EntityIcon type={other.type} size={13} className="shrink-0" />
                      <span
                        className="truncate text-[13px] text-ink"
                        style={{ color: entityColor(other.type) }}
                      >
                        {other.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-snug text-ink-soft">{rel.label}</p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="label mb-3">Supporting evidence · {supporting.length}</div>
          <ul className="space-y-3">
            {supporting.map((ev) => (
              <li
                key={ev.id}
                className="border-l-2 pl-3"
                style={{ borderColor: "var(--color-line-strong)" }}
              >
                <span className="mono text-[10px] uppercase tracking-wide text-accent-ink">
                  {ev.sourceLabel}
                </span>
                <p className="mt-0.5 text-[13px] font-medium text-ink">{ev.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{ev.detail}</p>
                {ev.url && (
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[12px] text-accent-ink hover:underline"
                  >
                    Verify at source
                    <ExternalLink size={11} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
