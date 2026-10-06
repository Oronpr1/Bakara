import { ROLE_LABELS, ROLES, type Role } from "@al/domain";
import { ChevronLeft, KeyRound, Shield, UserCheck, UserPlus, Users, UserX } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Field";
import { Tag } from "@/components/Pills";
import { CredentialsForm } from "@/components/settings/CredentialsForm";
import { Disclosure } from "@/components/settings/Disclosure";
import { RoleChecks } from "@/components/settings/RoleChecks";
import { btnQuiet, btnSecondary, card, summary as summaryClass } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/letters/queries";
import { currentSeason } from "@/lib/season-context";
import { getTrackBoard, loadPerPerson, type PersonLoad } from "@/lib/settings/queries";
import { ROLE_HINTS, ROLE_ORDER, ROLE_PLURALS } from "@/lib/settings/roles";
import { canOpenTab } from "@/lib/settings/tabs";
import { createPersonAction, setActiveAction, setPasswordAction, setRolesAction } from "./actions";

export const metadata = { title: "אנשים · הגדרות · מכתבי קבלה" };

function initials(name: string) {
  const parts = name.replace(/["'׳״.()]/g, "").split(/\s+/).filter((p) => p && !/^(ד"?ר|פרופ)$/.test(p));
  return parts.slice(0, 2).map((p) => p[0]).join("");
}

function loadText(load: PersonLoad | undefined) {
  if (!load) return null;
  const parts = [
    load.advisor && `יועצת ב-${load.advisor} מסלולים`,
    load.manager && `מנהל רישום ב-${load.manager} מסלולים`,
    load.extra && `נוסף/ה ל-${load.extra} מסלולים`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

type Filter = Role | "inactive" | "all";
const parseFilter = (v: string | string[] | undefined): Filter =>
  v === "inactive" ? "inactive" : (ROLES as readonly string[]).includes(String(v)) ? (v as Role) : "all";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ role?: string | string[] }> }) {
  const user = await requireUser();
  if (!canOpenTab(actorOf(user), "people")) notFound();
  const filter = parseFilter((await searchParams).role);
  const [people, { current }] = await Promise.all([listUsers(), currentSeason()]);
  const loads = current ? loadPerPerson((await getTrackBoard(actorOf(user), current.id)).tracks) : new Map<string, PersonLoad>();

  const active = people.filter((p) => p.active);
  const shown =
    filter === "all" ? people : filter === "inactive" ? people.filter((p) => !p.active) : active.filter((p) => p.roles.includes(filter));
  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "כולם", count: people.length },
    ...ROLE_ORDER.map((r) => ({ key: r as Filter, label: ROLE_PLURALS[r], count: active.filter((p) => p.roles.includes(r)).length })),
    { key: "inactive", label: "מושבתים", count: people.length - active.length },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold">אנשים</h2>
          <p className="text-sm text-muted">
            <span className="tabular">{active.length}</span> פעילים. אנשים לא נמחקים: מי שמושבת לא יכול להתחבר, וההיסטוריה שלו נשמרת.
          </p>
        </div>
      </div>

      <Disclosure
        className={`${card} group flex flex-col`}
        defaultOpen={people.length <= 1}
        summary={
          <summary className={`${summaryClass} text-base`}>
            <ChevronLeft aria-hidden className="chev size-4" />
            <UserPlus aria-hidden className="size-5" />
            הוספת אדם
          </summary>
        }
      >
        <div className="mt-4">
          <CredentialsForm
            action={createPersonAction}
            submitLabel="הוסף"
            submitIcon={<UserPlus aria-hidden className="size-4" />}
            pendingLabel="מוסיף…"
            passwordLabel="סיסמה ראשונית"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="שם מלא" name="name" required maxLength={200} autoComplete="off" />
              <Field label="מייל" name="email" type="email" required dir="ltr" autoComplete="off" />
            </div>
            <RoleChecks legend="תפקידים (אפשר כמה)" />
          </CredentialsForm>
        </div>
      </Disclosure>

      <section aria-labelledby="people-list" className="flex flex-col gap-3">
        <h3 id="people-list" className="sr-only">
          רשימת האנשים
        </h3>
        <nav aria-label="סינון לפי תפקיד">
          <ul className="flex flex-wrap gap-2">
            {chips
              .filter((c) => c.key === "all" || c.key === filter || c.count > 0)
              .map((c) => (
                <li key={c.key}>
                  <Link
                    href={c.key === "all" ? "/settings/people" : `/settings/people?role=${c.key}`}
                    aria-current={filter === c.key ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-150 ${
                      filter === c.key
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-line-strong bg-surface text-fg hover:bg-accent-soft"
                    }`}
                  >
                    {c.label}
                    <span className={`tabular text-xs ${filter === c.key ? "text-accent-fg/80" : "text-muted"}`}>{c.count}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
        {filter !== "all" && filter !== "inactive" && (
          <p className="flex items-start gap-1.5 text-sm text-muted">
            <Shield aria-hidden className="mt-0.5 size-4 text-accent" />
            <span>
              <b className="text-fg">{ROLE_LABELS[filter]}:</b> {ROLE_HINTS[filter]}
            </span>
          </p>
        )}

        {shown.length === 0 ? (
          <EmptyState icon={Users} title={filter === "inactive" ? "אין אנשים מושבתים" : "אין אנשים בתפקיד הזה"}>
            {filter === "inactive" ? "כל האנשים במערכת פעילים." : "מוסיפים אדם בטופס \"הוספת אדם\" למעלה, או נותנים את התפקיד למישהו קיים."}
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            {shown.map((p) => {
              const load = loadText(loads.get(p.id));
              const roleNames = ROLE_ORDER.filter((r) => p.roles.includes(r));
              return (
                <li key={p.id} className={`flex flex-col gap-2 px-4 py-3.5 sm:px-5 ${p.active ? "" : "bg-surface-2"}`}>
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
                        p.active ? "bg-accent-soft text-accent" : "bg-line text-muted"
                      }`}
                    >
                      {initials(p.name)}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-col">
                          <span className={`flex flex-wrap items-center gap-2 font-semibold ${p.active ? "" : "text-muted"}`}>
                            {p.name}
                            {!p.active && (
                              <Tag tone="bad" icon={UserX}>
                                מושבת
                              </Tag>
                            )}
                            {p.id === user.id && <Tag tone="accent">זה את/ה</Tag>}
                          </span>
                          <bdi dir="ltr" className="truncate text-sm text-muted">
                            {p.email}
                          </bdi>
                        </div>
                        {p.id !== user.id && (
                          <ActionForm
                            action={setActiveAction}
                            submitLabel={p.active ? "השבתה" : "הפעלה מחדש"}
                            submitIcon={p.active ? <UserX aria-hidden className="size-4" /> : <UserCheck aria-hidden className="size-4" />}
                            submitAriaLabel={p.active ? `השבת את ${p.name}` : `הפעל מחדש את ${p.name}`}
                            confirmLabel={p.active ? "השבת" : undefined}
                            buttonClassName={p.active ? btnQuiet : btnSecondary}
                            confirm={
                              p.active
                                ? `להשבית את ${p.name}? לא יהיה אפשר להתחבר עם המשתמש הזה.${
                                    load ? ` בעונה הנוכחית: ${load}. כדאי להעביר אותם למישהו אחר בלשונית "מסלולים והקצאות".` : ""
                                  }`
                                : undefined
                            }
                            inline
                          >
                            <input type="hidden" name="userId" value={p.id} />
                            <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                          </ActionForm>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="sr-only">תפקידים:</span>
                        {roleNames.length ? (
                          roleNames.map((r) => <Tag key={r}>{ROLE_LABELS[r]}</Tag>)
                        ) : (
                          <Tag tone="warn">ללא תפקיד</Tag>
                        )}
                      </div>
                      {load && current && (
                        <p className="text-sm text-muted">
                          בעונה {current.name}: {load}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-x-5">
                        <details className="group flex w-full flex-col sm:w-auto">
                          <summary className={`${summaryClass} text-sm`}>
                            <ChevronLeft aria-hidden className="chev size-4" />
                            עריכת תפקידים
                            <span className="sr-only"> של {p.name}</span>
                          </summary>
                          <ActionForm
                            action={setRolesAction}
                            submitLabel="שמור תפקידים"
                            submitAriaLabel={`שמור תפקידים של ${p.name}`}
                            buttonClassName={btnSecondary}
                            className="mt-2 flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3"
                          >
                            <input type="hidden" name="userId" value={p.id} />
                            <RoleChecks legend={`תפקידים של ${p.name}`} defaultChecked={p.roles} />
                          </ActionForm>
                        </details>
                        <details className="group flex w-full flex-col sm:w-auto">
                          <summary className={`${summaryClass} text-sm`}>
                            <ChevronLeft aria-hidden className="chev size-4" />
                            <KeyRound aria-hidden className="size-4" />
                            קביעת סיסמה חדשה
                            <span className="sr-only"> עבור {p.name}</span>
                          </summary>
                          <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3">
                            <CredentialsForm
                              action={setPasswordAction}
                              person={{ name: p.name, email: p.email }}
                              passwordLabel="סיסמה חדשה"
                              submitLabel="שמור סיסמה"
                              submitAriaLabel={`שמור סיסמה חדשה עבור ${p.name}`}
                              buttonClassName={btnSecondary}
                              className="flex flex-col gap-3"
                            >
                              <input type="hidden" name="userId" value={p.id} />
                            </CredentialsForm>
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
