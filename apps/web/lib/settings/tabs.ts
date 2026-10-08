// The tabs of the settings area ("הגדרות") and who sees each one. Who may do what comes from the
// core (canGlobal); this file only says which global action each tab belongs to.
// The order is the order of setting up: people once, then the tracks they are assigned to, then
// how each season works, and the rules to read.
import { canGlobal, type Actor, type GlobalAction } from "@al/domain";

export type SettingsTabKey = "people" | "tracks" | "seasons" | "rules";

export interface SettingsTab {
  key: SettingsTabKey;
  href: string;
  label: string;
  /** One line under the tab title. */
  blurb: string;
  need: GlobalAction;
}

export const SETTINGS_TABS: readonly SettingsTab[] = [
  {
    key: "people",
    href: "/settings/people",
    label: "אנשים",
    blurb: "מקימים פעם אחת את כל מי שעובד במערכת: יועצות, מנהלי רישום, סמנכ\"ל וגורמים אקדמיים.",
    need: "MANAGE_USERS",
  },
  {
    key: "tracks",
    href: "/settings/tracks",
    label: "מסלולים והקצאות",
    blurb: "המסלולים של העונה, ומי משובץ בכל אחד: יועצת, מנהל רישום ואנשים נוספים.",
    need: "MANAGE_UNITS",
  },
  {
    key: "seasons",
    href: "/settings/seasons",
    label: "עונות",
    blurb: "פתיחת עונה, ואיך כל עונה עובדת: סדר הבדיקה, תזכורות ותאריך יעד.",
    need: "MANAGE_SEASONS",
  },
  {
    key: "rules",
    href: "/settings/rules",
    label: "כללים",
    blurb: "מה כל תפקיד יכול לעשות במערכת.",
    need: "MANAGE_RULES",
  },
];

/** The tabs this person may open, in order. Empty: the settings area is not for them. */
export const settingsTabsFor = (actor: Actor) => SETTINGS_TABS.filter((t) => canGlobal(actor, t.need));

export const canOpenTab = (actor: Actor, key: SettingsTabKey) => settingsTabsFor(actor).some((t) => t.key === key);
