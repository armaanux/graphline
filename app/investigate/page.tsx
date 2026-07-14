"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useInvestigation } from "@/components/useInvestigation";
import { InvestigationView } from "@/components/InvestigationView";
import { Wordmark } from "@/components/brand";

function Live() {
  const params = useSearchParams();
  const q = params.get("q");
  const data = useInvestigation(q);

  if (!q) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <Wordmark className="h-7" />
        <p className="text-ink-soft">No query provided.</p>
        <Link href="/" className="text-accent-ink hover:underline">
          Start a new investigation →
        </Link>
      </div>
    );
  }

  return <InvestigationView data={data} />;
}

export default function InvestigatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Wordmark className="h-7" />
        </div>
      }
    >
      <Live />
    </Suspense>
  );
}
