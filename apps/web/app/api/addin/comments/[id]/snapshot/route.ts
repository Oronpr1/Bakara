import type { NextRequest } from "next/server";
import { corsHeaders, preflight, withAddinUser } from "@/lib/addin/http";
import { commentSnapshot } from "@/lib/addin/letters";
import { isUuid } from "@/lib/addin/ids";
import { notFound } from "@/lib/errors";

const METHODS = "GET, OPTIONS";

/** GET /api/addin/comments/:id/snapshot — PNG of the area the comment was written about. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withAddinUser(req, METHODS, async (_user, actor) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw notFound();
    const png = await commentSnapshot(actor, id);
    const headers = corsHeaders(req, METHODS);
    headers.set("Content-Type", "image/png");
    headers.set("Cache-Control", "private, no-store");
    return new Response(new Uint8Array(png), { headers });
  });
}

export function OPTIONS(req: NextRequest) {
  return preflight(req, METHODS);
}
