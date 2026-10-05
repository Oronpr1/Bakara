import { getDb } from "@al/db";
import { canOnLetter, STAGE_LABELS } from "@al/domain";
import type { NextRequest } from "next/server";
import { json, preflight, readLimitedForm, withAddinUser } from "@/lib/addin/http";
import { isUuid } from "@/lib/addin/ids";
import { assertDocumentIsLetter, graphResolverFromEnv } from "@/lib/addin/letters";
import { AppError, forbidden, notFound, userMessage } from "@/lib/errors";
import { currentCTag } from "@/lib/letters/live-file";
import { performTransition, uploadVersion } from "@/lib/letters/service";
import { loadLetter } from "@/lib/letters/state";

const METHODS = "POST, OPTIONS";
/** Two files of up to 30MB each, plus multipart overhead and the note. */
const MAX_BODY = 61 * 1024 * 1024;

async function fileBytes(form: FormData, name: string, label: string): Promise<Uint8Array> {
  const value = form.get(name);
  if (!(value instanceof Blob) || value.size === 0) throw new AppError("INVALID", `חסר קובץ ${label}`);
  return new Uint8Array(await value.arrayBuffer());
}

/**
 * POST /api/addin/letters/:id/versions (multipart: docx, pdf, note, submit, documentUrl)
 * Stores a new official version made by Word itself, and optionally submits it for review.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withAddinUser(req, METHODS, async (_user, actor) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw notFound();
    const form = await readLimitedForm(req, MAX_BODY);

    const documentUrl = String(form.get("documentUrl") ?? "");
    const note = String(form.get("note") ?? "").slice(0, 2000);
    const submit = form.get("submit") === "true";

    // The pane names the letter, but the document it was opened from must still be that letter's file.
    await assertDocumentIsLetter(id, documentUrl, { resolve: graphResolverFromEnv() });
    if (submit) {
      const { state } = await loadLetter(getDb(), id);
      if (!canOnLetter(actor, "SUBMIT_FOR_REVIEW", state)) throw forbidden();
    }

    const docx = await fileBytes(form, "docx", "Word");
    const pdf = await fileBytes(form, "pdf", "PDF");
    // Word saves to SharePoint on its own, so the file there is what the add-in just sent.
    const sharepointCTag = await currentCTag(id);
    const version = await uploadVersion(actor, id, { docx, pdf, note, pdfSource: "ADDIN", sharepointCTag });

    let stage = (await loadLetter(getDb(), id)).row.stage;
    let submitError: string | undefined;
    if (submit) {
      try {
        stage = await performTransition(actor, id, "SUBMIT_FOR_REVIEW");
      } catch (err) {
        // The version is saved either way; tell the user the submission itself did not go through.
        submitError = userMessage(err);
      }
    }
    return json(
      req,
      {
        versionNumber: version.number,
        pageCount: version.pageCount,
        stage,
        stageLabel: STAGE_LABELS[stage],
        submitted: submit && !submitError,
        ...(submitError ? { submitError } : {}),
      },
      { status: 201, methods: METHODS },
    );
  });
}

export function OPTIONS(req: NextRequest) {
  return preflight(req, METHODS);
}
