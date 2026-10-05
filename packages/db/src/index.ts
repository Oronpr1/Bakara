import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export * as schema from "./schema";
export * from "./password";
export type Db = NodePgDatabase<typeof schema>;

let pool: pg.Pool | undefined;
let db: Db | undefined;

/** Shared connection pool for the process. DATABASE_URL must be set outside local development. */
export function getDb(): Db {
  if (!db) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL ?? "postgres://al:al@localhost:5432/acceptance_letters",
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    });
    db = drizzle(pool, { schema });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}
