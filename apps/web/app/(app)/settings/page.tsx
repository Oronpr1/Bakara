import { notFound, redirect } from "next/navigation";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { settingsTabsFor } from "@/lib/settings/tabs";

/** "/settings" opens the assignments (the heart of it), or the first tab this person may open. */
export default async function SettingsHome() {
  const tabs = settingsTabsFor(actorOf(await requireUser()));
  const first = tabs.find((t) => t.key === "tracks") ?? tabs[0];
  if (!first) notFound();
  redirect(first.href);
}
