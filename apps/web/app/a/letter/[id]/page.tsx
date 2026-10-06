import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AcademicRoom } from "@/components/room/AcademicRoom";
import { actorOf } from "@/lib/actor";
import { currentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { getLetterRoom } from "@/lib/letters/queries";
import { toRoomProps } from "@/lib/room/view";

export const metadata = { title: "מכתב קבלה לבדיקתך", referrer: "no-referrer" as const };

/**
 * The academic approver's clean page (no app menus). Only for a session opened from a personal
 * link; a signed-in staff member is sent to the full review room.
 */
export default async function AcademicLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await currentUser();
  if (!user) redirect("/a/invalid");
  if (!user.linkLetterId) redirect(`/letters/${id}`);
  const room = await getLetterRoom(actorOf(user), id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  return (
    <main className="min-h-dvh bg-bg">
      <AcademicRoom room={toRoomProps(room, { id: user.id, name: user.name })} />
    </main>
  );
}
