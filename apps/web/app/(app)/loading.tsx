/** Shown while a page in the app loads: the page's rough shape, so nothing jumps when it arrives. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">טוען…</span>
      <div className="flex flex-col gap-2">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-8 w-64" />
      </div>
      <div className="skeleton h-28 w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
