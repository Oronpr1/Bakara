"use server";

import { ROLES } from "@al/domain";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { formObject, runAction } from "@/lib/actions";
import { createUser, setUserActive, setUserRoles } from "@/lib/users/service";

const roles = z.array(z.enum(ROLES)).min(1, { message: "צריך לבחור לפחות תפקיד אחד" });
const PATHS = ["/admin/users"];

export async function createUserAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({
      name: z.string({ message: "צריך למלא שם" }).trim().min(1, { message: "צריך למלא שם" }).max(200),
      email: z.email({ message: "כתובת המייל לא תקינה" }),
      roles,
    }),
    formObject(form, ["roles"]),
    (actor, d) => createUser(actor, d),
    PATHS,
    "המשתמש נוסף",
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
