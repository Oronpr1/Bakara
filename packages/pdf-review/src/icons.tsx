/** Stroke icons on a 24-unit grid; decorative (the button carries the name). */
export const ICONS = {
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  minus: "M5 12h14",
  plus: "M5 12h14M12 5v14",
  fitWidth: "M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4",
  fitPage: "M6 3h12v18H6zM9.5 9.5L12 7l2.5 2.5M9.5 14.5L12 17l2.5-2.5",
  select: "M6 3l12 7-5.5 1.5L10 17z",
  note: "M5 4h14v10l-5 5H5zM14 19v-5h5",
  x: "M6 6l12 12M18 6L6 18",
  line: "M5 19L19 5",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  palette: "M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8.5-9-8.5z",
} as const;

export function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
