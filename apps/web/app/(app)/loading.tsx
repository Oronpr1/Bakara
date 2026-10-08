/** Shown while a page in the app loads: the home screen's rough shape, so nothing jumps when it arrives. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">טוען…</span>
      <div className="flex flex-col gap-2">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-8 w-56" />
        <div className="skeleton h-4 w-48" />
      </div>
      <div className="skeleton h-16 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`skeleton h-24 rounded-xl ${i === 4 ? "col-span-2 sm:col-span-1" : ""}`} />
        ))}
      </div>
      <div className="skeleton h-20 w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
