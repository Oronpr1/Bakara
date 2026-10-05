import { FileQuestion, Inbox } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { btnSecondary } from "@/components/ui";

export default function NotFound() {
  return (
    <section className="mx-auto w-full max-w-xl py-6">
      <EmptyState
        icon={FileQuestion}
        as="h1"
        title="הדף לא נמצא"
        action={
          <Link href="/" className={btnSecondary}>
            <Inbox aria-hidden className="size-4" />
            חזרה לעבודה שלי
          </Link>
        }
      >
        ייתכן שהקישור שגוי, או שאין לך גישה לפריט הזה.
      </EmptyState>
    </section>
  );
}
