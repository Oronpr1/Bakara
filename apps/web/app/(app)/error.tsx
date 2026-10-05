"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { btnSecondary } from "@/components/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section role="alert" className="mx-auto w-full max-w-xl py-6">
      <EmptyState
        icon={TriangleAlert}
        tone="bad"
        as="h1"
        title="משהו השתבש"
        action={
          <button onClick={reset} className={btnSecondary}>
            <RotateCw aria-hidden className="size-4" />
            נסה שוב
          </button>
        }
      >
        נסו שוב. אם זה חוזר, פנו למנהלת הבקרה.
      </EmptyState>
    </section>
  );
}
