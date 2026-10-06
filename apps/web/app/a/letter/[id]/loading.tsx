/** While the academic approver's page loads: its rough shape. */
export default function Loading() {
  return (
    <main className="min-h-dvh bg-bg" aria-busy="true" aria-live="polite">
      <span className="sr-only">טוען…</span>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-8 w-72" />
        <div className="skeleton h-16 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="skeleton hidden h-80 rounded-xl lg:block" />
          <div className="skeleton h-[70dvh] rounded-xl" />
        </div>
      </div>
    </main>
  );
}
