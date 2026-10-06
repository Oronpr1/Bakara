"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { formObject, runAction } from "@/lib/actions";
import { setCampusDefaults, setUnitDefaults } from "@/lib/units/service";

const person = z.uuid().optional();
const PATHS = ["/admin/units", "/", "/season"];

export async function setCampusDefaultsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ campusId: z.uuid(), registrationManagerId: person, advisorId: person }),
    formObject(form),
    (actor, d) =>
      setCampusDefaults(actor, d.campusId, {
        registrationManagerId: d.registrationManagerId ?? null,
        advisorId: d.advisorId ?? null,
      }),
    PATHS,
    "נשמר",
  );
}

export async function setUnitDefaultsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ unitId: z.uuid(), registrationManagerId: person, advisorId: person }),
    formObject(form),
    (actor, d) =>
      setUnitDefaults(actor, d.unitId, {
        registrationManagerId: d.registrationManagerId ?? null,
        advisorId: d.advisorId ?? null,
      }),
    PATHS,
    "נשמר",
  );
}
