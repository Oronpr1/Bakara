"use client";

import { useState } from "react";

/**
 * A <details> whose first state comes from the data ("open when the list is empty") and then
 * belongs to the person: a save that changes the data does not snap it shut and hide the result.
 */
export function Disclosure({
  defaultOpen = false,
  className,
  summary,
  children,
}: {
  defaultOpen?: boolean;
  className?: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open] = useState(defaultOpen);
  return (
    <details className={className} open={open}>
      {summary}
      {children}
    </details>
  );
}
