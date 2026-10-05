import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type { ActionResult } from "./action-result";
import { actorOf } from "./actor";
import { requireUser } from "./auth/session";
import { userMessage } from "./errors";
import type { Actor } from "@al/domain";

/** Reads a form into an object: repeated names become arrays, empty strings become undefined. */
export function formObject(form: FormData, arrays: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    const values = form.getAll(key).filter((v) => v !== "");
    out[key] = arrays.includes(key) ? values : values[0];
  }
  for (const key of arrays) out[key] ??= [];
  return out;
}

/**
 * The shared shape of a form action: sign-in check, input validation, the service call,
 * a Hebrew error on failure, and revalidation of the pages that show the change.
 */
export async function runAction<S extends z.ZodType>(
  schema: S,
  input: unknown,
  run: (actor: Actor, data: z.infer<S>) => Promise<unknown>,
  paths: string[] | ((data: z.infer<S>) => string[]),
  message?: string,
): Promise<ActionResult> {
  const actor = actorOf(await requireUser());
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "הטופס לא מולא כראוי" };
  try {
    await run(actor, parsed.data);
  } catch (err) {
    return { error: userMessage(err) };
  }
  for (const p of typeof paths === "function" ? paths(parsed.data) : paths) revalidatePath(p);
  return { ok: true, message };
}
