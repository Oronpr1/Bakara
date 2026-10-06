import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SEASON_COOKIE } from "@/lib/season-context";

/**
 * The track import moved to /settings/tracks, which works on the season chosen in the header.
 * An old "import into this season" link chooses that season and opens the new screen.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (z.uuid().safeParse(id).success)
    (await cookies()).set(SEASON_COOKIE, id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  redirect("/settings/tracks");
}
