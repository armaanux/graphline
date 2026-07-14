"use client";

import { InvestigationView } from "@/components/InvestigationView";
import { investigationToCase } from "@/components/useInvestigation";
import type { Investigation } from "@/lib/engine/types";

export function CaseClient({ investigation }: { investigation: Investigation }) {
  return <InvestigationView data={investigationToCase(investigation)} />;
}
