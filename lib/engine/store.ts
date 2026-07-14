import { promises as fs } from "fs";
import path from "path";
import type { Investigation } from "./types";

/**
 * File-based investigation store, scoped per session. Files are named
 * `<sid>.<id>.json` so each op can only touch the caller's own cases.
 */
const DATA_DIR = path.join(process.cwd(), ".data", "investigations");

// SECURITY: validating both ids blocks path traversal via id/sid.
const ID_RE = /^inv_[A-Za-z0-9_-]{6,24}$/;
const SID_RE = /^[A-Za-z0-9_-]{16,40}$/;

function valid(sid: string, id: string): boolean {
  return SID_RE.test(sid) && ID_RE.test(id);
}
function fileFor(sid: string, id: string): string {
  return path.join(DATA_DIR, `${sid}.${id}.json`);
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export interface InvestigationSummary {
  id: string;
  query: string;
  identifierType: string;
  status: Investigation["status"];
  createdAt: string;
  entities: number;
  evidence: number;
  riskLevel?: string;
  headline?: string;
}

export async function saveInvestigation(
  inv: Investigation,
  sid: string
): Promise<void> {
  if (!valid(sid, inv.id)) return;
  // best-effort: a read-only/ephemeral filesystem must not fail the run
  try {
    await ensureDir();
    await fs.writeFile(fileFor(sid, inv.id), JSON.stringify(inv, null, 2), "utf8");
  } catch {
    /* history just won't persist here */
  }
}

export async function loadInvestigation(
  id: string,
  sid: string
): Promise<Investigation | null> {
  if (!valid(sid, id)) return null;
  try {
    const raw = await fs.readFile(fileFor(sid, id), "utf8");
    return JSON.parse(raw) as Investigation;
  } catch {
    return null;
  }
}

export async function listInvestigations(
  sid: string
): Promise<InvestigationSummary[]> {
  if (!SID_RE.test(sid)) return [];
  await ensureDir();
  let files: string[];
  try {
    files = await fs.readdir(DATA_DIR);
  } catch {
    return [];
  }
  const prefix = `${sid}.`;
  const summaries: InvestigationSummary[] = [];
  for (const f of files) {
    if (!f.startsWith(prefix) || !f.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, f), "utf8");
      const inv = JSON.parse(raw) as Investigation;
      summaries.push({
        id: inv.id,
        query: inv.query,
        identifierType: inv.identifier.type,
        status: inv.status,
        createdAt: inv.createdAt,
        entities: inv.entities.length,
        evidence: inv.evidence.length,
        riskLevel: inv.report?.riskLevel,
        headline: inv.report?.mostLikelyIdentity,
      });
    } catch {
      /* skip corrupt */
    }
  }
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteInvestigation(
  id: string,
  sid: string
): Promise<void> {
  if (!valid(sid, id)) return;
  try {
    await fs.unlink(fileFor(sid, id));
  } catch {
    /* already gone */
  }
}
