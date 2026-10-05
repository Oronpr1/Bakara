// Shared Tailwind class strings, so every screen looks and behaves the same.
// Buttons are at least 44px tall (touch target), change color in 150ms, and never shift layout.
const btnBase =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60";
export const input =
  "min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg transition-colors duration-150 placeholder:text-muted hover:border-muted focus:border-accent aria-[invalid=true]:border-bad";
export const btnPrimary = `${btnBase} bg-accent text-accent-fg shadow-card hover:bg-accent/90 active:bg-accent/80`;
export const btnSecondary = `${btnBase} border border-line-strong bg-surface text-fg hover:bg-accent-soft active:bg-accent-soft/70`;
export const btnGood = `${btnBase} bg-good text-surface shadow-card hover:bg-good/90 active:bg-good/80`;
export const btnDanger = `${btnBase} border border-bad/40 bg-surface text-bad hover:bg-bad-soft`;
/** Small secondary control for dense lists (still 36px tall, with spacing around it). */
export const btnQuiet =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-muted transition-colors duration-150 hover:border-bad/40 hover:text-bad disabled:cursor-not-allowed disabled:opacity-60";
/** Square icon-only button; always give it an aria-label. */
export const btnIcon =
  "inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-fg disabled:cursor-not-allowed disabled:opacity-60";
export const btnLink = "cursor-pointer text-accent underline-offset-4 hover:underline";
export const card = "rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5";
export const label = "text-sm font-semibold";
export const hint = "text-xs text-muted";
/** A <summary> that reads as a disclosure button; put <ChevronLeft className="chev" /> first inside. */
export const summary =
  "inline-flex min-h-9 items-center gap-1.5 rounded-md font-semibold text-accent transition-colors duration-150 hover:text-accent/80";
export const sectionTitle = "text-lg font-bold";
