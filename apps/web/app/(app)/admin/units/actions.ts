"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { formObject, runAction } from "@/lib/actions";
import { setUnitRegistrationManager } from "@/lib/units/service";

export async function setUnitManagerAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ unitId: z.uuid(), userId: z.uuid().optional() }),
    formObject(form),
    (actor, d) => setUnitRegistrationManager(actor, d.unitId, d.userId ?? null),
    ["/admin/units", "/", "/seasons"],
    "נשמר",
  );
}
