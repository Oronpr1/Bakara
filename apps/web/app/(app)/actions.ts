"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { revokeSession } from "@/lib/auth/service";
import { clearSessionCookie, requireUser, SESSION_COOKIE } from "@/lib/auth/session";
import { SEASON_COOKIE } from "@/lib/season-context";

export async function logoutAction() {
  await revokeSession((await cookies()).get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
  redirect("/login");
}

/** Moves the whole system to another season: the home screen of that season. */
export async function switchSeasonAction(form: FormData) {
  await requireUser();
  const seasonId = z.uuid().safeParse(form.get("seasonId"));
  if (!seasonId.success) return;
  (await cookies()).set(SEASON_COOKIE, seasonId.data, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/");
}
