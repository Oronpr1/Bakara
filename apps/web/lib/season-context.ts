import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { listSeasons } from "./letters/queries";

export const SEASON_COOKIE = "al_season";

/**
 * The season the system is working on: the one chosen in the header (kept in a cookie), else
 * the newest active season, else the newest. Null when no season exists yet.
 */
export const currentSeason = cache(async () => {
  const seasons = await listSeasons();
  if (seasons.length === 0) return { current: null, seasons };
  const chosen = (await cookies()).get(SEASON_COOKIE)?.value;
  const current = seasons.find((s) => s.id === chosen) ?? seasons.find((s) => s.status === "ACTIVE") ?? seasons[0]!;
  return { current, seasons };
});
