"use server";

import { ROLES } from "@al/domain";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { formObject, runAction } from "@/lib/actions";
import { createUser, setUserActive, setUserPassword, setUserRoles } from "@/lib/users/service";

const roles = z.array(z.enum(ROLES), { message: "תפקיד לא מוכר" }).min(1, { message: "צריך לבחור לפחות תפקיד אחד" });
const password = z.string({ message: "צריך לקבוע סיסמה" }).min(1, { message: "צריך לקבוע סיסמה" });
const PATHS = ["/settings/people", "/settings/tracks"];

export async function createPersonAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({
      name: z.string({ message: "צריך למלא שם" }).trim().min(1, { message: "צריך למלא שם" }).max(200, { message: "השם ארוך מדי" }),
      email: z.email({ message: "כתובת המייל לא תקינה" }),
      roles,
      password,
    }),
    formObject(form, ["roles"]),
    (actor, d) => createUser(actor, d),
    PATHS,
    "נוסף/ה למערכת",
  );
}

export async function setRolesAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ userId: z.uuid(), roles }),
    formObject(form, ["roles"]),
    (actor, d) => setUserRoles(actor, d.userId, d.roles),
    PATHS,
    "התפקידים נשמרו",
  );
}

export async function setActiveAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ userId: z.uuid(), active: z.enum(["true", "false"]) }),
    formObject(form),
    (actor, d) => setUserActive(actor, d.userId, d.active === "true"),
    PATHS,
  );
}

export async function setPasswordAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ userId: z.uuid(), password }),
    formObject(form),
    (actor, d) => setUserPassword(actor, d.userId, d.password),
    PATHS,
    "הסיסמה נקבעה. אם היה מחובר, יצטרך להיכנס מחדש.",
  );
}
