import Link from "next/link";
import { btnLink } from "@/components/ui";

export default function NotFound() {
  return (
    <section className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-bold">הדף לא נמצא</h1>
      <p className="text-muted">ייתכן שהקישור שגוי, או שאין לך גישה לפריט הזה.</p>
      <Link href="/" className={btnLink}>
        חזרה לעבודה שלי
      </Link>
    </section>
  );
}
