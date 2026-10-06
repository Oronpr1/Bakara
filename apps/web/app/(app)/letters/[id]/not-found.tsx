import { FileQuestion, Inbox } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { btnSecondary } from "@/components/ui";

export default function LetterNotFound() {
  return (
    <section className="mx-auto w-full max-w-xl py-6">
      <EmptyState
        icon={FileQuestion}
        as="h1"
        title="המכתב לא נמצא"
        action={
          <Link href="/" className={btnSecondary}>
            <Inbox aria-hidden className="size-4" />
            חזרה לעבודה שלי
          </Link>
        }
      >
        ייתכן שהקישור שגוי, שהמכתב שייך לעונה אחרת, או שאין לך גישה אליו.
      </EmptyState>
    </section>
  );
}
