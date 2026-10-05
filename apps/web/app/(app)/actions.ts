"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revokeSession } from "@/lib/auth/service";
import { clearSessionCookie, SESSION_COOKIE } from "@/lib/auth/session";

export async function logoutAction() {
  await revokeSession((await cookies()).get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
  redirect("/login");
}
