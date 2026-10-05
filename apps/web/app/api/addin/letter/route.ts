import type { NextRequest } from "next/server";
import { findLetterIdByDocumentUrl, graphResolverFromEnv, letterForAddin } from "@/lib/addin/letters";
import { json, preflight, withAddinUser } from "@/lib/addin/http";
import { AppError } from "@/lib/errors";

const METHODS = "GET, OPTIONS";

/** GET /api/addin/letter?url=<Office.context.document.url> — the letter open in Word. */
export async function GET(req: NextRequest) {
  return withAddinUser(req, METHODS, async (_user, actor) => {
    const url = req.nextUrl.searchParams.get("url") ?? "";
    if (!url || url.length > 4000) throw new AppError("INVALID", "חסרה כתובת המסמך");
    const letterId = await findLetterIdByDocumentUrl(url, { resolve: graphResolverFromEnv() });
    if (!letterId) throw new AppError("NOT_FOUND", "המסמך הפתוח לא מזוהה כקובץ של מכתב במערכת");
    return json(req, { letter: await letterForAddin(actor, letterId) }, { methods: METHODS });
  });
}

export function OPTIONS(req: NextRequest) {
  return preflight(req, METHODS);
}
