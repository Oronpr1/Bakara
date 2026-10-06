/** While the review room loads: header, step bar, action bar, panel and letter, so nothing jumps. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">טוען את המכתב…</span>
      <div className="flex flex-col gap-2">
        <div className="skeleton h-4 w-28" />
        <div className="skeleton h-8 w-80 max-w-full" />
        <div className="skeleton h-4 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-1.5 rounded-full" />
        ))}
      </div>
      <div className="skeleton h-16 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="hidden flex-col gap-3 lg:flex">
          <div className="skeleton h-12 rounded-lg" />
          <div className="skeleton h-28 rounded-lg" />
          <div className="skeleton h-28 rounded-lg" />
        </div>
        <div className="skeleton h-[70dvh] rounded-xl" />
      </div>
    </div>
  );
}
