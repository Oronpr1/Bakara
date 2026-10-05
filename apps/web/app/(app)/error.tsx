"use client";

import { btnSecondary } from "@/components/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="flex flex-col items-start gap-3" role="alert">
      <h1 className="text-2xl font-bold">משהו השתבש</h1>
      <p className="text-muted">נסו שוב. אם זה חוזר, פנו למנהלת הבקרה.</p>
      <button onClick={reset} className={btnSecondary}>
        נסה שוב
      </button>
    </section>
  );
}
