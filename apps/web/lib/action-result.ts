/** What every form's server action returns to useActionState. null = not submitted yet. */
export type ActionResult = { ok: true; message?: string } | { error: string } | null;
