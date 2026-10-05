import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "./index.js";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

await migrate(getDb(), { migrationsFolder });
await closeDb();
console.log("Migrations applied");
