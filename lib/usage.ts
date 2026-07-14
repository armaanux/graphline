import { promises as fs } from "fs";
import path from "path";

/**
 * Daily usage budget, both limits reset at UTC midnight: a per-IP cap on the
 * expensive crawl, and a global owner-key budget. Past the owner budget
 * requests still run keyless. Persisted to .data to survive restarts on a
 * single instance; back with a shared store (Redis) for multi-instance.
 *
 * Both caps are opt-in: unset means unlimited, so a self-hosted copy runs
 * freely. Set them on a shared public deployment to protect the owner's key.
 */

const FILE = path.join(process.cwd(), ".data", "usage.json");
const OWNER_CAP = process.env.GRAPHLINE_DAILY_OWNER_CAP
  ? Number(process.env.GRAPHLINE_DAILY_OWNER_CAP)
  : Infinity;
const PER_IP_CAP = process.env.GRAPHLINE_DAILY_PER_IP
  ? Number(process.env.GRAPHLINE_DAILY_PER_IP)
  : Infinity;

interface Usage {
  date: string;
  owner: number;
  ip: Record<string, number>;
}

let mem: Usage | null = null;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function current(): Promise<Usage> {
  if (mem && mem.date === today()) return mem;
  if (!mem) {
    try {
      const raw = JSON.parse(await fs.readFile(FILE, "utf8")) as Usage;
      if (raw && raw.date === today()) {
        mem = raw;
        return mem;
      }
    } catch {
      /* no usage file yet */
    }
  }
  mem = { date: today(), owner: 0, ip: {} };
  return mem;
}

async function persist(u: Usage): Promise<void> {
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(u));
  } catch {
    /* best-effort; counters still hold in memory this process */
  }
}

function secondsUntilReset(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  return Math.max(60, Math.round((tomorrow.getTime() - now.getTime()) / 1000));
}

export interface UsageDecision {
  allowed: boolean;
  /** whether this request may spend the owner's search key */
  useOwnerKey: boolean;
  reason?: string;
  retryAfterSec?: number;
}

/**
 * Reserve one investigation for `ip`. `hasOwnKey` requests don't count against
 * the owner budget. Returns whether to allow it and whether it may use the
 * owner's key.
 */
export async function reserveInvestigation(
  ip: string,
  hasOwnKey: boolean
): Promise<UsageDecision> {
  if (OWNER_CAP === Infinity && PER_IP_CAP === Infinity) {
    return { allowed: true, useOwnerKey: !hasOwnKey };
  }

  const u = await current();

  const ipCount = u.ip[ip] ?? 0;
  if (ipCount >= PER_IP_CAP) {
    return {
      allowed: false,
      useOwnerKey: false,
      reason: `Daily limit reached (${PER_IP_CAP} investigations from your network). It resets at midnight UTC — or self-host with your own keys to lift it.`,
      retryAfterSec: secondsUntilReset(),
    };
  }
  u.ip[ip] = ipCount + 1;

  let useOwnerKey = false;
  if (!hasOwnKey && u.owner < OWNER_CAP) {
    u.owner += 1;
    useOwnerKey = true;
  }

  await persist(u);
  return { allowed: true, useOwnerKey };
}
