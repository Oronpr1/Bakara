import { Settings } from "lucide-react";
import { notFound } from "next/navigation";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { settingsTabsFor } from "@/lib/settings/tabs";

export const metadata = { title: "הגדרות · מכתבי קבלה" };

/** "הגדרות": where the control manager sets up people, tracks, campuses, seasons and sees the rules. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const tabs = settingsTabsFor(actorOf(await requireUser()));
  if (tabs.length === 0) notFound();
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Settings aria-hidden className="size-6 text-accent" />
            הגדרות
          </h1>
          <p className="text-sm text-muted">מכאן מקימים אנשים, מסלולים ועונות, וקובעים מי אחראי על כל מכתב.</p>
        </div>
        <SettingsTabs tabs={tabs.map(({ key, href, label }) => ({ key, href, label }))} />
      </header>
      {children}
    </div>
  );
}
