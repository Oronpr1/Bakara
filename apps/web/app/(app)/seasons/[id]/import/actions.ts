"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { userMessage } from "@/lib/errors";
import { importTracks, planTrackImport, readTrackFile, type ImportReport } from "@/lib/import/service";

export type ImportState = { error?: string; mode?: "preview" | "import"; report?: ImportReport } | null;

const MAX_BYTES = 2 * 1024 * 1024;

export async function importTracksAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const actor = actorOf(await requireUser());
  const seasonId = z.uuid().safeParse(form.get("seasonId"));
  const file = form.get("file");
  const mode = form.get("intent") === "import" ? "import" : "preview";
  if (!seasonId.success) return { error: "העונה לא נמצאה" };
  if (!(file instanceof File) || file.size === 0) return { error: "צריך לבחור קובץ" };
  if (file.size > MAX_BYTES) return { error: "הקובץ גדול מדי (עד 2MB)" };
  try {
    const rows = await readTrackFile(file.name, Buffer.from(await file.arrayBuffer()));
    if (mode === "preview") return { mode, report: await planTrackImport(actor, seasonId.data, rows) };
    const report = await importTracks(actor, seasonId.data, rows);
    revalidatePath(`/seasons/${seasonId.data}`);
    revalidatePath("/admin/units");
    revalidatePath("/");
    return { mode, report };
  } catch (err) {
    return { error: userMessage(err) };
  }
}
