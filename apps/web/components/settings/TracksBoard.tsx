"use client";

import { CircleAlert, CircleCheck, Search, UserPlus, Users, X } from "lucide-react";
import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { StatusChip, Tag } from "@/components/Pills";
import { Spinner } from "@/components/Spinner";
import { btnIcon, btnPrimary, btnSecondary, input, label as labelClass } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import type { BulkMode } from "@/lib/settings/assign";
import type { ManagerSource, PersonRef, TrackAssignment } from "@/lib/settings/queries";
import type { BulkState } from "@/app/(app)/settings/tracks/actions";

const SOURCE: Record<ManagerSource, string> = {
  TRACK: "נקבע למסלול",
  FACULTY: "מהפקולטה",
  CAMPUS: "מהקמפוס",
  ONLY_VP: "",
  NONE: "",
};

const MODES: { mode: BulkMode; label: string; explain: string; people: "advisors" | "managers" | null; verb: (who: string) => string }[] = [
  {
    mode: "ADVISOR",
    label: "להקצות יועצת אחראית",
    explain: "היועצת תקבל את המסלולים לרשימת המכתבים שלה, במקום היועצת הנוכחית.",
    people: "advisors",
    verb: (who) => `להקצות את ${who} כיועצת האחראית`,
  },
  {
    mode: "MANAGER",
    label: "לקבוע מנהל רישום למסלולים",
    explain: "הוא יבדוק את המכתבים של המסלולים האלה, במקום מנהל הרישום של הפקולטה או הקמפוס.",
    people: "managers",
    verb: (who) => `לקבוע את ${who} כמנהל הרישום`,
  },
  {
    mode: "MANAGER_DEFAULT",
    label: "להחזיר את מנהל הרישום של הפקולטה או הקמפוס",
    explain: "מבטל מנהל רישום שנקבע למסלול, והמסלול חוזר לברירת המחדל של הפקולטה או הקמפוס.",
    people: null,
    verb: () => "להחזיר את מנהל הרישום לברירת המחדל",
  },
  {
    mode: "ADD_ADVISOR",
    label: "להוסיף יועצת נוספת",
    explain: "עוד יועצת שמכינה ומתקנת את המכתב, יחד עם היועצת האחראית.",
    people: "advisors",
    verb: (who) => `להוסיף את ${who} כיועצת נוספת`,
  },
  {
    mode: "ADD_MANAGER",
    label: "להוסיף מנהל רישום נוסף",
    explain: "עוד מנהל רישום שיכול לבדוק ולאשר במקום מנהל הרישום. מספיק שאחד מהם יאשר.",
    people: "managers",
    verb: (who) => `להוסיף את ${who} כמנהל רישום נוסף`,
  },
  {
    mode: "REMOVE_ADVISOR",
    label: "להסיר יועצת נוספת",
    explain: "מסיר יועצת שצורפה כנוספת. לא משנה את היועצת האחראית.",
    people: "advisors",
    verb: (who) => `להסיר את ${who} (יועצת נוספת)`,
  },
  {
    mode: "REMOVE_MANAGER",
    label: "להסיר מנהל רישום נוסף",
    explain: "מסיר מנהל רישום שצורף כנוסף. לא משנה את מנהל הרישום של המסלול.",
    people: "managers",
    verb: (who) => `להסיר את ${who} (מנהל רישום נוסף)`,
  },
];

const norm = (s: string) => s.replace(/["'׳״.\-]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const tracksWord = (n: number) => (n === 1 ? "מסלול אחד" : `${n} מסלולים`);
const inTracks = (n: number) => (n === 1 ? "במסלול אחד" : `ב-${n} מסלולים`);

function AdvisorCell({ t }: { t: TrackAssignment }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <span className={t.advisor.ok ? "" : "text-muted line-through"}>{t.advisor.name}</span>
      {t.missingAdvisor && (
        <Tag tone="bad" icon={CircleAlert}>
          חסרה יועצת פעילה
        </Tag>
      )}
    </span>
  );
}

function ManagerCell({ t }: { t: TrackAssignment }) {
  if (t.managerSource === "ONLY_VP") return <Tag tone="accent">רק הסמנכ&quot;ל בודק</Tag>;
  if (!t.manager)
    return (
      <Tag tone="bad" icon={CircleAlert}>
        אין מנהל רישום
      </Tag>
    );
  return (
    <span className="flex flex-col items-start">
      <span>{t.manager.name}</span>
      <span className={`text-xs ${t.managerSource === "TRACK" ? "font-semibold text-accent" : "text-muted"}`}>{SOURCE[t.managerSource]}</span>
    </span>
  );
}

function Extras({ t, remove }: { t: TrackAssignment; remove: (t: TrackAssignment, e: TrackAssignment["extras"][number]) => void }) {
  if (t.extras.length === 0) return <span className="text-muted">—</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {t.extras.map((e) => (
        <li key={`${e.kind}:${e.id}`} className="inline-flex items-center gap-0.5 rounded-full bg-bg py-0.5 ps-2.5 pe-0.5 text-xs ring-1 ring-line ring-inset">
          <span>
            {e.name} · {e.kind === "ADVISOR" ? "יועצת" : "מנהל רישום"}
          </span>
          <button
            type="button"
            onClick={() => remove(t, e)}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-bad-soft hover:text-bad"
            aria-label={`להסיר את ${e.name} מ${t.trackName}`}
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The tracks of the season with their people. Search, filter, choose several, and assign them in one
 * go. What may be changed comes from the server (canChangeAdvisor); this screen only gathers choices.
 */
export function TracksBoard({
  tracks,
  advisors,
  managers,
  bulkAction,
  removeAction,
}: {
  tracks: TrackAssignment[];
  advisors: PersonRef[];
  managers: PersonRef[];
  bulkAction: (prev: BulkState, form: FormData) => Promise<BulkState>;
  removeAction: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
}) {
  const [q, setQ] = useState("");
  const [campus, setCampus] = useState("");
  const [faculty, setFaculty] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<BulkMode>("ADVISOR");
  const [userId, setUserId] = useState("");
  const [asking, setAsking] = useState(false);
  const [bulk, dispatchBulk, bulkPending] = useActionState<BulkState, FormData>(bulkAction, null);
  const [dismissed, setDismissed] = useState(0);
  const [removing, setRemoving] = useState<{ t: TrackAssignment; e: TrackAssignment["extras"][number] } | null>(null);
  const [removed, dispatchRemove, removePending] = useActionState<ActionResult, FormData>(removeAction, null);

  const campuses = useMemo(() => [...new Set(tracks.map((t) => t.campus))].sort((a, b) => a.localeCompare(b, "he")), [tracks]);
  const faculties = useMemo(
    () => [...new Set(tracks.filter((t) => !campus || t.campus === campus).map((t) => t.faculty))].sort((a, b) => a.localeCompare(b, "he")),
    [tracks, campus],
  );
  const shown = useMemo(() => {
    const needle = norm(q);
    return tracks.filter(
      (t) =>
        (!campus || t.campus === campus) &&
        (!faculty || t.faculty === faculty) &&
        (!onlyMissing || t.missingAdvisor || t.missingManager) &&
        (!needle || norm(t.trackName).includes(needle) || t.trackNumber.includes(needle)),
    );
  }, [tracks, q, campus, faculty, onlyMissing]);

  const missingManager = tracks.filter((t) => t.missingManager).length;
  const missingAdvisor = tracks.filter((t) => t.missingAdvisor).length;
  const allShownSelected = shown.length > 0 && shown.every((t) => selected.has(t.id));
  const hiddenSelected = [...selected].filter((id) => !shown.some((t) => t.id === id)).length;
  const canAssignAdvisor = tracks.some((t) => t.canChangeAdvisor);

  const current = MODES.find((m) => m.mode === mode)!;
  const people = current.people === "advisors" ? advisors : current.people === "managers" ? managers : [];
  const person = people.find((p) => p.id === userId);
  const ready = selected.size > 0 && (current.people === null || Boolean(person));

  // After a successful assignment the choice is done: clear it. (Failures stay listed below.)
  const bulkAt = bulk && "ok" in bulk ? bulk.at : 0;
  useEffect(() => {
    if (bulkAt) setSelected(new Set());
  }, [bulkAt]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleShown() {
    setSelected((s) => {
      const n = new Set(s);
      if (allShownSelected) shown.forEach((t) => n.delete(t.id));
      else shown.forEach((t) => n.add(t.id));
      return n;
    });
  }
  function apply() {
    setAsking(false);
    const data = new FormData();
    data.set("mode", mode);
    if (current.people && userId) data.set("userId", userId);
    selected.forEach((id) => data.append("letterIds", id));
    startTransition(() => dispatchBulk(data));
  }
  function confirmRemove() {
    if (!removing) return;
    const data = new FormData();
    data.set("letterId", removing.t.id);
    data.set("userId", removing.e.id);
    data.set("kind", removing.e.kind);
    setRemoving(null);
    startTransition(() => dispatchRemove(data));
  }

  if (tracks.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* What is missing, at a glance. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">
          <span className="tabular">{tracks.length}</span> מסלולים בעונה
        </span>
        {missingManager > 0 ? (
          <Tag tone="bad" icon={CircleAlert}>
            {tracksWord(missingManager)} בלי מנהל רישום
          </Tag>
        ) : null}
        {missingAdvisor > 0 ? (
          <Tag tone="bad" icon={CircleAlert}>
            {tracksWord(missingAdvisor)} בלי יועצת פעילה
          </Tag>
        ) : null}
        {missingManager === 0 && missingAdvisor === 0 && (
          <Tag tone="good" icon={CircleCheck}>
            לכל המסלולים יש יועצת ומנהל רישום
          </Tag>
        )}
      </div>

      {/* Search and filters. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>חיפוש מסלול</span>
          <span className="relative">
            <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="שם או קוד, למשל MBA" className={`${input} ps-9`} />
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>קמפוס</span>
          <select
            value={campus}
            onChange={(e) => {
              setCampus(e.target.value);
              setFaculty("");
            }}
            className={input}
          >
            <option value="">כל הקמפוסים</option>
            {campuses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>פקולטה</span>
          <select value={faculty} onChange={(e) => setFaculty(e.target.value)} className={input}>
            <option value="">כל הפקולטות</option>
            {faculties.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          רק מה שחסר
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
          <input type="checkbox" checked={allShownSelected} onChange={toggleShown} disabled={shown.length === 0} className="size-4 accent-[var(--accent)]" />
          {allShownSelected ? "בטל את הבחירה של המוצגים" : `בחר את כל ${shown.length} המוצגים`}
        </label>
        <span className="text-muted">
          מוצגים <span className="tabular">{shown.length}</span> מתוך <span className="tabular">{tracks.length}</span>
        </span>
      </div>

      {(removed || removePending) && (
        <p role="status" className={`flex items-center gap-1.5 text-sm ${removed && "error" in removed ? "text-bad" : "text-good"}`}>
          {removePending ? <Spinner /> : removed && "error" in removed ? <CircleAlert aria-hidden className="size-4" /> : <CircleCheck aria-hidden className="size-4" />}
          {removePending ? "מסיר…" : removed && "error" in removed ? removed.error : removed && "ok" in removed ? removed.message : ""}
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState icon={Search} title="אין מסלולים שמתאימים לחיפוש">
          אפשר לשנות את החיפוש או לנקות את הסינון.
        </EmptyState>
      ) : (
        <>
          {/* Desktop: a table. */}
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface shadow-card lg:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">מסלולי העונה והאחראים עליהם</caption>
              <thead className="bg-surface-2 text-muted">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <span className="sr-only">בחירה</span>
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                    מסלול
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                    קמפוס · פקולטה
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                    מצב המכתב
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                    יועצת
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                    מנהל רישום
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                    אנשים נוספים
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((t) => {
                  const warn = t.missingAdvisor || t.missingManager;
                  return (
                    <tr key={t.id} className={`align-top ${selected.has(t.id) ? "bg-accent-soft/50" : warn ? "bg-bad-soft/30" : ""}`}>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => toggle(t.id)}
                          aria-label={`בחירת ${t.trackName} (${t.trackNumber})`}
                          className="mt-0.5 size-4 cursor-pointer accent-[var(--accent)]"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold">{t.trackName}</span>
                        <span className="block text-xs text-muted">
                          <bdi className="tabular">{t.trackNumber}</bdi>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {t.campus}
                        <span className="block text-xs text-muted">{t.faculty}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusChip state={t.state} />
                      </td>
                      <td className="px-3 py-2.5">
                        <AdvisorCell t={t} />
                      </td>
                      <td className="px-3 py-2.5">
                        <ManagerCell t={t} />
                      </td>
                      <td className="px-3 py-2.5">
                        <Extras t={t} remove={(tt, e) => setRemoving({ t: tt, e })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phone and tablet: a card per track. */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {shown.map((t) => {
              const warn = t.missingAdvisor || t.missingManager;
              return (
                <li
                  key={t.id}
                  className={`flex flex-col gap-2 rounded-xl border bg-surface p-3 shadow-card ${
                    selected.has(t.id) ? "border-accent bg-accent-soft/40" : warn ? "border-bad/40" : "border-line"
                  }`}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={() => toggle(t.id)}
                      className="mt-1 size-5 shrink-0 cursor-pointer accent-[var(--accent)]"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">{t.trackName}</span>
                      <span className="text-xs text-muted">
                        <bdi className="tabular">{t.trackNumber}</bdi> · {t.campus} · {t.faculty}
                      </span>
                    </span>
                  </label>
                  <div className="ps-8">
                    <StatusChip state={t.state} />
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 ps-8 text-sm">
                    <dt className="text-muted">יועצת</dt>
                    <dd>
                      <AdvisorCell t={t} />
                    </dd>
                    <dt className="text-muted">מנהל רישום</dt>
                    <dd>
                      <ManagerCell t={t} />
                    </dd>
                    {t.extras.length > 0 && (
                      <>
                        <dt className="text-muted">נוספים</dt>
                        <dd>
                          <Extras t={t} remove={(tt, e) => setRemoving({ t: tt, e })} />
                        </dd>
                      </>
                    )}
                  </dl>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* The assignment bar: appears once tracks are chosen, and stays in view. */}
      {(selected.size > 0 || (bulk && !(("at" in bulk) && bulk.at === dismissed))) && (
        <section
          aria-label="הקצאה למסלולים שנבחרו"
          className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-xl border border-accent/50 bg-surface p-3 shadow-pop sm:p-4"
        >
          {selected.size > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-semibold">
                  <Users aria-hidden className="size-5 text-accent" />
                  נבחרו {tracksWord(selected.size)}
                  {hiddenSelected > 0 && <span className="text-sm font-normal text-muted">({hiddenSelected} מהם לא מוצגים בסינון)</span>}
                </p>
                <button type="button" className={btnIcon} onClick={() => setSelected(new Set())} aria-label="נקה את הבחירה">
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                <label className="flex flex-col gap-1.5">
                  <span className={labelClass}>מה לעשות</span>
                  <select
                    value={mode}
                    onChange={(e) => {
                      setMode(e.target.value as BulkMode);
                      setUserId("");
                    }}
                    className={input}
                  >
                    {MODES.map((m) => (
                      <option key={m.mode} value={m.mode} disabled={m.mode === "ADVISOR" && !canAssignAdvisor}>
                        {m.label}
                        {m.mode === "ADVISOR" && !canAssignAdvisor ? " (רק מנהלת הבקרה)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {current.people && (
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClass}>{current.people === "advisors" ? "יועצת" : "מנהל רישום"}</span>
                    <select value={userId} onChange={(e) => setUserId(e.target.value)} className={input}>
                      <option value="">{current.people === "advisors" ? "בחרו יועצת" : "בחרו מנהל רישום"}</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button type="button" className={`${btnPrimary} sm:col-span-2 lg:col-span-1`} disabled={!ready || bulkPending} onClick={() => setAsking(true)}>
                  {bulkPending ? <Spinner /> : <UserPlus aria-hidden className="size-4" />}
                  {bulkPending ? "מעדכן…" : `החל על ${tracksWord(selected.size)}`}
                </button>
              </div>
              <p className="text-sm text-muted">{current.explain}</p>
              {people.length === 0 && current.people && (
                <p className="text-sm text-bad">
                  אין עדיין {current.people === "advisors" ? "יועצות בקרה" : "מנהלי רישום"} במערכת. מוסיפים אותם בלשונית &quot;אנשים&quot;.
                </p>
              )}
            </>
          ) : null}

          {!bulkPending && bulk && "error" in bulk && (
            <p role="alert" className="flex items-start gap-1.5 text-sm text-bad">
              <CircleAlert aria-hidden className="mt-0.5 size-4" />
              {bulk.error}
            </p>
          )}
          {!bulkPending && bulk && "ok" in bulk && bulk.at !== dismissed && (
            <div role="status" className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-start gap-1.5 font-semibold text-good">
                  <CircleCheck aria-hidden className="mt-0.5 size-4" />
                  {bulk.message}
                </p>
                {selected.size === 0 && (
                  <button type="button" className={btnIcon} onClick={() => setDismissed(bulk.at)} aria-label="סגור את ההודעה">
                    <X aria-hidden className="size-4" />
                  </button>
                )}
              </div>
              {bulk.failed.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-md bg-bad-soft px-3 py-2 text-bad">
                  {bulk.failed.map((f, i) => (
                    <li key={i}>
                      <b>{f.track}:</b> {f.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={asking}
        message={`${current.verb(person?.name ?? "")} ${inTracks(selected.size)}?${
          person && (mode === "ADVISOR" || mode.startsWith("ADD"))
            ? ` ${selected.size === 1 ? "המסלול יופיע" : "המסלולים יופיעו"} ברשימה של ${person.name}.`
            : ""
        }`}
        confirmLabel="כן, להחיל"
        onCancel={() => setAsking(false)}
        onConfirm={apply}
      />
      <ConfirmDialog
        open={removing !== null}
        message={removing ? `להסיר את ${removing.e.name} מ${removing.t.trackName}?` : ""}
        confirmLabel="הסר"
        onCancel={() => setRemoving(null)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
