import type { NextRequest } from "next/server";
import { listInvestigations } from "@/lib/engine/store";
import { sidFromRequest } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sid = sidFromRequest(req);
  if (!sid) return Response.json({ items: [] });
  const items = await listInvestigations(sid);
  return Response.json({ items });
}
