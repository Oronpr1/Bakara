// Icons and colours of the home screen's groups. Colour follows the shared state families
// (components/Pills.tsx); the personal tiles ("לטיפול שלך"…) are not states, so they stay neutral.
import type { Tone } from "@al/domain";
import { BadgeCheck, Inbox, ListTodo, type LucideIcon, ScanSearch, Send, ShieldCheck } from "lucide-react";
import type { Group } from "@/lib/home/model";

export const PERSONAL_ICONS: Partial<Record<Group, LucideIcon>> = {
  mine: Inbox,
  todo: ListTodo,
  review: ScanSearch,
  final: ShieldCheck,
  others: Send,
  done: BadgeCheck,
};

/** Static class names per colour family (Tailwind needs to see them whole). */
export const TILE_TONES: Record<Tone, { top: string; ring: string; text: string; bar: string }> = {
  prep: { top: "border-t-prep", ring: "ring-prep", text: "text-prep", bar: "bg-prep" },
  review: { top: "border-t-review", ring: "ring-review", text: "text-review", bar: "bg-review" },
  acad: { top: "border-t-acad", ring: "ring-acad", text: "text-acad", bar: "bg-acad" },
  final: { top: "border-t-final", ring: "ring-final", text: "text-final", bar: "bg-final" },
  good: { top: "border-t-good", ring: "ring-good", text: "text-good", bar: "bg-good" },
  warn: { top: "border-t-warn", ring: "ring-warn", text: "text-warn", bar: "bg-warn" },
  bad: { top: "border-t-bad", ring: "ring-bad", text: "text-bad", bar: "bg-bad" },
};

/** "מכתב אחד", "3 מכתבים". */
export const letters = (n: number) => (n === 1 ? "מכתב אחד" : `${n} מכתבים`);
/** "יום אחד", "6 ימים", "היום". */
export const days = (n: number) => (n === 0 ? "מהיום" : n === 1 ? "יום אחד" : `${n} ימים`);
/** From this many days a wait is shown in red (as in the shared Holder chip). */
export const LATE_DAYS = 5;
