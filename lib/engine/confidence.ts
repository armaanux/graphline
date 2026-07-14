import type { ConfidenceBand, Evidence } from "./types";

/**
 * Combine independent observations via noisy-OR: each weight is a probability
 * of being right, so the chance all are wrong is the product of complements.
 * Weak sources stay weak; independent ones compound toward (never reaching) 1.
 * A capped diversity bonus rewards corroboration across distinct collectors.
 */
export function combineConfidence(
  evidence: Evidence[],
  sourceIds: string[] = []
): number {
  if (evidence.length === 0) return 0;

  let productWrong = 1;
  for (const e of evidence) {
    const w = clamp(e.weight, 0.01, 0.97);
    productWrong *= 1 - w;
  }
  let score = 1 - productWrong;

  const distinctSources = new Set(
    sourceIds.length ? sourceIds : evidence.map((e) => e.sourceId)
  ).size;
  if (distinctSources >= 2) {
    score = score + (1 - score) * Math.min(0.25, 0.08 * (distinctSources - 1));
  }

  return clamp(score, 0, 0.99);
}

export function band(score: number): ConfidenceBand {
  if (score >= 0.72) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

export function bandLabel(score: number): string {
  const b = band(score);
  return b === "high" ? "High" : b === "medium" ? "Moderate" : "Low";
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function pct(score: number): number {
  return Math.round(score * 100);
}
