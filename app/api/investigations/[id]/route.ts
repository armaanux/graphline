import type { NextRequest } from "next/server";
import { deleteInvestigation, loadInvestigation } from "@/lib/engine/store";
import { sidFromRequest } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sid = sidFromRequest(req);
  if (!sid) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const inv = await loadInvestigation(id, sid);
  if (!inv) return new Response("Not found", { status: 404 });
  return Response.json(inv);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sid = sidFromRequest(req);
  if (!sid) return new Response(null, { status: 204 });
  const { id } = await params;
  await deleteInvestigation(id, sid);
  return new Response(null, { status: 204 });
}
