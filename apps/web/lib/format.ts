const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Jerusalem" });
const dateTimeFmt = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jerusalem",
});

/** A calendar date (YYYY-MM-DD) or a timestamp, as a short Hebrew date. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(`${value}T12:00:00Z`) : value;
  return dateFmt.format(d);
}

export function formatDateTime(value: Date): string {
  return dateTimeFmt.format(value);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
