import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ManageMenu } from "@/components/room/ManageMenu";
import { Room } from "@/components/room/Room";
import { RoomHeader } from "@/components/room/RoomHeader";
import { WordFile } from "@/components/room/WordFile";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { AppError, userMessage } from "@/lib/errors";
import { liveFileStatus } from "@/lib/letters/live-file";
import { getLetterRoom } from "@/lib/letters/queries";
import { getDocumentHost } from "@/lib/m365/config";
import { academicChoices } from "@/lib/room/queries";
import { toRoomProps } from "@/lib/room/view";

export const metadata = { title: "מכתב · מכתבי קבלה" };

/** חדר הבדיקה: one letter, its one next action, the PDF with comments, and who decided what. */
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
  const choices = room.can.sendToAcademic ? await academicChoices(id) : { suggested: [], others: [] };

  // "ערוך ב-Word" only with Microsoft 365, and only while versions may be added.
  let wordSlot: React.ReactNode = null;
  if (getDocumentHost() !== null && room.can.uploadVersion) {
    const word = await liveFileStatus(room.row).then(
      (status) => ({ status, error: null }),
      (e: unknown) => ({ status: null, error: userMessage(e) }),
    );
    wordSlot = <WordFile letterId={id} webUrl={room.row.sharepointWebUrl} status={word.status} error={word.error} latestVersion={room.row.latestVersion} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <RoomHeader room={props} backHref="/" actions={<ManageMenu room={props} />} />
      <Room room={props} choices={choices} wordSlot={wordSlot} />
    </div>
  );
}
