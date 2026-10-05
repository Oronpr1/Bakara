// Per-address limit on login attempts, kept in memory. The app runs as one web process; if it is
// ever scaled out, each process limits separately, which is still a useful brake.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 30;
const hits = new Map<string, number[]>();

/** Records an attempt from this address; false when it has made too many recently. */
export function allowLoginAttempt(ip: string | null, now = Date.now()): boolean {
  if (!ip) return true;
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  return recent.length <= MAX_ATTEMPTS;
}

export function resetLoginThrottle() {
  hits.clear();
}
