import { canGlobal } from "@al/domain";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { getSeason } from "@/lib/letters/queries";
import { ImportForm } from "./ImportForm";

export const metadata = { title: "ייבוא מסלולים · מכתבי קבלה" };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success || !canGlobal(actorOf(user), "MANAGE_UNITS")) notFound();
  const season = await getSeason(id);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href={`/seasons/${season.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg hover:underline">
          <ChevronLeft aria-hidden className="size-3.5" />
          {season.name}
        </Link>
        <h1 className="text-2xl font-bold">ייבוא מסלולים</h1>
        <p className="text-sm text-muted">מעלים רשימת מסלולים, בודקים מה יקרה, ואז מייבאים.</p>
      </header>
      <ImportForm seasonId={season.id} seasonName={season.name} />
    </div>
  );
}
