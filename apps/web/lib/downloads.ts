import "server-only";
import { getDb, schema } from "@al/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { actorOf } from "./actor";
import { currentUser } from "./auth/session";
import { AppError } from "./errors";
import { contentDisposition, versionFilename } from "./http";
import { letterForFile } from "./letters/queries";
import { getFileStore } from "./storage";

const TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  png: "image/png",
} as const;

const plain = (status: number, text: string) =>
  new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

function fileResponse(bytes: Uint8Array, type: keyof typeof TYPES, filename: string, inline: boolean) {
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": TYPES[type],
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": contentDisposition(filename, inline ? "inline" : "attachment"),
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Signs in, finds the file's letter, checks VIEW on it and streams the file. Anything the
 * user may not see answers 404, so ids cannot be probed.
 */
async function guarded(find: () => Promise<Response>): Promise<Response> {
  try {
    return await find();
  } catch (err) {
    if (err instanceof AppError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) return plain(404, "הקובץ לא נמצא");
    console.error(err);
    return plain(500, "משהו השתבש");
  }
}

export async function serveVersionFile(rawId: string, kind: "docx" | "pdf"): Promise<Response> {
  const user = await currentUser();
  if (!user) return plain(401, "צריך להתחבר");
  if (!z.uuid().safeParse(rawId).success) return plain(404, "הקובץ לא נמצא");
  return guarded(async () => {
    const [version] = await getDb().select().from(schema.versions).where(eq(schema.versions.id, rawId));
    if (!version) throw new AppError("NOT_FOUND", "");
    const letter = await letterForFile(actorOf(user), version.letterId);
    const key = kind === "docx" ? version.docxKey : version.pdfKey;
    if (!key) throw new AppError("NOT_FOUND", ""); // a version uploaded as a PDF alone has no Word file
    const bytes = await getFileStore().get(key);
    return fileResponse(bytes, kind, versionFilename(letter, version.number, kind), kind === "pdf");
  });
}

export async function serveCommentSnapshot(rawId: string): Promise<Response> {
  const user = await currentUser();
  if (!user) return plain(401, "צריך להתחבר");
  if (!z.uuid().safeParse(rawId).success) return plain(404, "הקובץ לא נמצא");
  return guarded(async () => {
    const [comment] = await getDb().select().from(schema.comments).where(eq(schema.comments.id, rawId));
    if (!comment?.snapshotKey) throw new AppError("NOT_FOUND", "");
    const letter = await letterForFile(actorOf(user), comment.letterId);
    const bytes = await getFileStore().get(comment.snapshotKey);
    const name = `${letter.trackNumber}-${letter.trackName}-v${comment.versionNumber}-p${comment.page}-comment.png`;
    return fileResponse(bytes, "png", name, true);
  });
}
