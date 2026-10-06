import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { RoomHeader } from "@/components/room/RoomHeader";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { getLetterRoom } from "@/lib/letters/queries";
import { toRoomProps } from "@/lib/room/view";

export const metadata = { title: "מכתב · מכתבי קבלה" };

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) notFound();
  // Someone who came in through a personal link gets the clean page with no menus.
  if (user.linkLetterId) redirect(`/a/letter/${id}`);
  const room = await getLetterRoom(actorOf(user), id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const props = toRoomProps(room, { id: user.id, name: user.name });
  return (
    <div className="flex flex-col gap-4">
      <RoomHeader room={props} backHref="/" />
    </div>
  );
}
