// Development seed: one user per role and an active season. Never run against production.
import type { Role } from "@al/domain";
import { closeDb, getDb } from "./index";
import { seasons, users } from "./schema";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");

const people: { email: string; name: string; roles: Role[] }[] = [
  { email: "control.manager@example.test", name: "מנהלת בקרה (דמו)", roles: ["CONTROL_MANAGER", "ADMIN"] },
  { email: "vp@example.test", name: 'סמנכ"ל רישום (דמו)', roles: ["VP_REGISTRATION"] },
  { email: "advisor1@example.test", name: "יועצת בקרה 1 (דמו)", roles: ["CONTROL_ADVISOR"] },
  { email: "advisor2@example.test", name: "יועצת בקרה 2 (דמו)", roles: ["CONTROL_ADVISOR"] },
  { email: "registration@example.test", name: "מנהל רישום (דמו)", roles: ["REGISTRATION_MANAGER"] },
  { email: "academic1@example.test", name: "גורם אקדמי 1 (דמו)", roles: ["ACADEMIC_APPROVER"] },
  { email: "academic2@example.test", name: "גורם אקדמי 2 (דמו)", roles: ["ACADEMIC_APPROVER"] },
];

const db = getDb();
await db.insert(users).values(people).onConflictDoNothing();
const existing = await db.query.seasons.findFirst();
if (!existing) await db.insert(seasons).values({ name: 'תשפ"ז א\'' });
await closeDb();
console.log(`Seeded ${people.length} demo users`);
