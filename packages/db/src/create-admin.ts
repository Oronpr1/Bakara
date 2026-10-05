// Creates (or re-activates) the first control manager, who then adds everyone else in the app:
//   pnpm db:create-admin <email> "<name>" [password]
// Without a password (or ADMIN_PASSWORD) a strong one is generated and printed once.
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "./index";
import { hashPassword, passwordProblem } from "./password";
import { users } from "./schema";

const [email, name, passwordArg] = process.argv.slice(2);
if (!email?.includes("@") || !name?.trim()) {
  console.error('Usage: pnpm db:create-admin <email> "<name>" [password]');
  process.exit(1);
}

const given = passwordArg ?? process.env.ADMIN_PASSWORD;
const password = given ?? randomBytes(12).toString("base64url");
const problem = passwordProblem(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}
const passwordHash = await hashPassword(password);

const [row] = await getDb()
  .insert(users)
  .values({
    email: email.trim().toLowerCase(),
    name: name.trim(),
    roles: ["CONTROL_MANAGER", "ADMIN"],
    passwordHash,
    passwordSetAt: new Date(),
  })
  .onConflictDoUpdate({
    target: users.email,
    set: {
      active: true,
      passwordHash,
      passwordSetAt: new Date(),
      failedLogins: 0,
      lockedUntil: null,
      roles: sql`array(select distinct unnest(${users.roles} || '{CONTROL_MANAGER,ADMIN}'::role[]))`,
    },
  })
  .returning({ email: users.email, roles: users.roles });
await closeDb();
console.log(`${row!.email}: ${row!.roles.join(", ")}`);
if (!given) console.log(`סיסמה (מוצגת פעם אחת, לשמור במקום בטוח): ${password}`);
