import { notFound } from "next/navigation";
import { loadInvestigation } from "@/lib/engine/store";
import { sidFromContext } from "@/lib/session";
import { CaseClient } from "./CaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sid = await sidFromContext();
  const inv = sid ? await loadInvestigation(id, sid) : null;
  if (!inv) notFound();
  return <CaseClient investigation={inv} />;
}
