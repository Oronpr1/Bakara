"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { formObject, runAction } from "@/lib/actions";
import { setCampusDefaults, setUnitDefaults } from "@/lib/units/service";

const person = z.uuid().optional();
const fields = { registrationManagerId: person, advisorId: person, onlyVp: z.literal("on").optional() };
const PATHS = ["/settings/units", "/settings/tracks", "/settings/people", "/"];

/** An empty choice clears the setting (the campus's applies again); the switch is off when unticked. */
const change = (d: { registrationManagerId?: string; advisorId?: string; onlyVp?: "on" }) => ({
  registrationManagerId: d.registrationManagerId ?? null,
  advisorId: d.advisorId ?? null,
  onlyVp: d.onlyVp === "on",
});

export async function setCampusDefaultsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ campusId: z.uuid(), ...fields }),
    formObject(form),
    (actor, d) => setCampusDefaults(actor, d.campusId, change(d)),
    PATHS,
    "נשמר. השינוי חל על כל המסלולים בקמפוס שאין להם הגדרה משלהם.",
  );
}

export async function setUnitDefaultsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    z.object({ unitId: z.uuid(), ...fields }),
    formObject(form),
    (actor, d) => setUnitDefaults(actor, d.unitId, change(d)),
    PATHS,
    "נשמר. השינוי חל על כל המסלולים בפקולטה שאין להם הגדרה משלהם.",
  );
}
