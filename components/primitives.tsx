import type { EntityType, ExposureBand, VerificationTier } from "@/lib/engine/types";
import {
  AtSign,
  Building2,
  FileText,
  Fingerprint,
  Globe,
  Phone,
  FolderGit2,
  Share2,
  ShieldAlert,
  User,
  AppWindow,
  BadgeCheck,
  CircleDot,
  CircleDashed,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<EntityType, LucideIcon> = {
  person: User,
  email: AtSign,
  phone: Phone,
  username: Fingerprint,
  domain: Globe,
  website: AppWindow,
  organization: Building2,
  social_profile: Share2,
  repository: FolderGit2,
  document: FileText,
  risk: ShieldAlert,
};

export const ENTITY_LABEL: Record<EntityType, string> = {
  person: "Person",
  email: "Email",
  phone: "Phone",
  username: "Username",
  domain: "Domain",
  website: "Website",
  organization: "Organization",
  social_profile: "Account",
  repository: "Repository",
  document: "Document",
  risk: "Signal",
};

const ENTITY_COLOR_VAR: Record<EntityType, string> = {
  person: "--color-node-person",
  email: "--color-node-email",
  phone: "--color-node-phone",
  username: "--color-node-username",
  domain: "--color-node-domain",
  website: "--color-node-website",
  organization: "--color-node-org",
  social_profile: "--color-node-social",
  repository: "--color-node-repo",
  document: "--color-node-document",
  risk: "--color-node-risk",
};

export function entityColor(type: EntityType): string {
  return `var(${ENTITY_COLOR_VAR[type]})`;
}

export function EntityIcon({
  type,
  size = 16,
  className,
  strokeWidth = 1.9,
  style,
}: {
  type: EntityType;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  const Icon = ICONS[type];
  return <Icon size={size} className={className} strokeWidth={strokeWidth} style={style} />;
}

function bandOf(score: number): "high" | "medium" | "low" {
  if (score >= 0.72) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

export function bandColor(score: number): string {
  const b = bandOf(score);
  return b === "high"
    ? "var(--color-high)"
    : b === "medium"
    ? "var(--color-medium)"
    : "var(--color-low)";
}

export function ConfidenceMeter({
  score,
  showLabel = true,
}: {
  score: number;
  showLabel?: boolean;
}) {
  const pct = Math.round(score * 100);
  const color = bandColor(score);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-14 overflow-hidden rounded-full bg-line-strong">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(6, pct)}%`, background: color }}
        />
      </div>
      {showLabel && (
        <span className="mono text-[11px]" style={{ color }}>
          {pct}%
        </span>
      )}
    </div>
  );
}

// Framed as identity corroboration, not danger.
const CORROBORATION_META: Record<string, { label: string; fg: string }> = {
  clear: { label: "Well corroborated", fg: "var(--color-high)" },
  low: { label: "Limited footprint", fg: "var(--color-medium)" },
  elevated: { label: "Limited footprint", fg: "var(--color-medium)" },
  high: { label: "Limited footprint", fg: "var(--color-medium)" },
};

export function RiskBadge({ level }: { level: string }) {
  const m = CORROBORATION_META[level] ?? CORROBORATION_META.low;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 mono text-[11px] font-medium tracking-wide"
      style={{ color: m.fg, borderColor: "var(--color-line-strong)", background: "var(--color-surface)" }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: m.fg }} />
      {m.label}
    </span>
  );
}

const VERIFICATION_META: Record<
  VerificationTier,
  { label: string; icon: LucideIcon; color: string; hint: string }
> = {
  confirmed: {
    label: "Confirmed",
    icon: BadgeCheck,
    color: "var(--color-success)",
    hint: "Verified as the same owner — a cryptographic proof, or linked from the subject's own site.",
  },
  likely: {
    label: "Likely",
    icon: CircleDot,
    color: "var(--color-info)",
    hint: "Multiple independent sources agree, but ownership isn't proven.",
  },
  unverified: {
    label: "Same handle · unverified",
    icon: CircleDashed,
    color: "var(--color-faint)",
    hint: "The handle exists here, but the owner isn't confirmed — it could be a different person.",
  },
};

export function VerificationBadge({ tier }: { tier: VerificationTier }) {
  const m = VERIFICATION_META[tier];
  const Icon = m.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 mono text-[10.5px] font-medium tracking-wide"
      style={{
        color: m.color,
        borderColor: "var(--color-line-strong)",
        background: "var(--color-surface)",
      }}
      title={m.hint}
    >
      <Icon size={11} strokeWidth={2} />
      {m.label}
    </span>
  );
}

export const EXPOSURE_META: Record<ExposureBand, { label: string; color: string }> = {
  minimal: { label: "Minimal exposure", color: "var(--color-success)" },
  moderate: { label: "Moderate exposure", color: "var(--color-info)" },
  high: { label: "High exposure", color: "var(--color-warning)" },
  significant: { label: "Significant exposure", color: "var(--color-danger)" },
};

const LEVEL_COLOR = {
  low: "var(--color-success)",
  med: "var(--color-warning)",
  high: "var(--color-danger)",
} as const;

export function exposureLevelColor(level: "low" | "med" | "high"): string {
  return LEVEL_COLOR[level];
}
