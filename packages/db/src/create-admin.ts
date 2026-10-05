// Creates (or re-activates) the first control manager, who then adds everyone else in the app:
//   pnpm db:create-admin <email> "<name>"
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "./index";
import { users } from "./schema";

const [email, name] = process.argv.slice(2);
if (!email?.includes("@") || !name?.trim()) {
  console.error('Usage: pnpm db:create-admin <email> "<name>"');
  process.exit(1);
}

const [row] = await getDb()
  .insert(users)
  .values({ email: email.trim().toLowerCase(), name: name.trim(), roles: ["CONTROL_MANAGER", "ADMIN"] })
  .onConflictDoUpdate({
    target: users.email,
    set: { active: true, roles: sql`array(select distinct unnest(${users.roles} || '{CONTROL_MANAGER,ADMIN}'::role[]))` },
  })
  .returning({ email: users.email, roles: users.roles });
await closeDb();
console.log(`${row!.email}: ${row!.roles.join(", ")}`);
