import { canGlobal, ROLE_LABELS, ROLES } from "@al/domain";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { CheckboxGroup, Field } from "@/components/Field";
import { Tag } from "@/components/Pills";
import { ChevronLeft, KeyRound, UserCheck, UserPlus, UserX } from "lucide-react";
import { btnQuiet, btnSecondary, card, summary as summaryClass } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/letters/queries";
import { createUserAction, setActiveAction, setPasswordAction, setRolesAction } from "./actions";

export const metadata = { title: "משתמשים · מכתבי קבלה" };

function initials(name: string) {
  const parts = name.replace(/["'׳״.]/g, "").split(/\s+/).filter((p) => p && !/^(ד"?ר|פרופ)$/.test(p));
  return parts.slice(0, 2).map((p) => p[0]).join("");
}

const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export default async function UsersPage() {
  const user = await requireUser();
  if (!canGlobal(actorOf(user), "MANAGE_USERS")) notFound();
  const people = await listUsers();

  const activeCount = people.filter((p) => p.active).length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">משתמשים</h1>
        <p className="text-sm text-muted">משתמשים לא נמחקים. משתמש מושבת לא יכול להתחבר, וההיסטוריה שלו נשמרת.</p>
      </div>

      <section aria-labelledby="add-user" className={`${card} flex flex-col gap-4`}>
        <h2 id="add-user" className="flex items-center gap-2 text-lg font-bold">
          <UserPlus aria-hidden className="size-5 text-accent" />
          הוספת משתמש
        </h2>
        <ActionForm
          action={createUserAction}
          submitLabel="הוסף משתמש"
          submitIcon={<UserPlus aria-hidden className="size-4" />}
          pendingLabel="מוסיף…"
          className="flex flex-col gap-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="שם מלא" name="name" required maxLength={200} autoComplete="off" />
            <Field label="מייל" name="email" type="email" required dir="ltr" autoComplete="off" />
            <Field
              label="סיסמה ראשונית"
              name="password"
              type="text"
              required
              minLength={10}
              dir="ltr"
              autoComplete="off"
              hint="לפחות 10 תווים. מוסרים למשתמש בעצמכם; אפשר לשנות בכל עת."
            />
          </div>
          <CheckboxGroup legend="תפקידים" name="roles" options={roleOptions} />
        </ActionForm>
      </section>

      <section aria-labelledby="all-users" className="flex flex-col gap-3">
        <h2 id="all-users" className="flex flex-wrap items-baseline gap-2 text-lg font-bold">
          כל המשתמשים
          <span className="text-sm font-normal text-muted">
            <span className="tabular">{activeCount}</span> פעילים מתוך <span className="tabular">{people.length}</span>
          </span>
        </h2>
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          {people.map((p) => (
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
                <div className="flex min-w-0 flex-1 flex-col gap-1">
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
                        confirm={p.active ? `להשבית את ${p.name}? הוא/היא לא יוכלו להתחבר.` : undefined}
                        inline
                      >
                        <input type="hidden" name="userId" value={p.id} />
                        <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                      </ActionForm>
                    )}
                  </div>
                  <details className="group flex flex-col">
                    <summary className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="flex flex-wrap gap-1.5">
                        <span className="sr-only">תפקידים:</span>
                        {p.roles.length ? (
                          p.roles.map((r) => <Tag key={r}>{ROLE_LABELS[r]}</Tag>)
                        ) : (
                          <span className="text-sm text-muted">ללא תפקיד</span>
                        )}
                      </span>
                      <span className={`${summaryClass} text-sm`}>
                        <ChevronLeft aria-hidden className="chev size-4" />
                        עריכה
                        <span className="sr-only"> של התפקידים של {p.name}</span>
                      </span>
                    </summary>
                    <ActionForm
                      action={setRolesAction}
                      submitLabel="שמור תפקידים"
                      submitAriaLabel={`שמור תפקידים של ${p.name}`}
                      buttonClassName={btnSecondary}
                      className="mt-2 flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3"
                    >
                      <input type="hidden" name="userId" value={p.id} />
                      <CheckboxGroup legend={`תפקידים של ${p.name}`} name="roles" options={roleOptions} defaultChecked={p.roles} />
                    </ActionForm>
                  </details>
                  <details className="group flex flex-col">
                    <summary className={`${summaryClass} text-sm`}>
                      <ChevronLeft aria-hidden className="chev size-4" />
                      <KeyRound aria-hidden className="size-4" />
                      קביעת סיסמה חדשה
                      <span className="sr-only"> עבור {p.name}</span>
                    </summary>
                    <ActionForm
                      action={setPasswordAction}
                      submitLabel="שמור סיסמה"
                      submitAriaLabel={`שמור סיסמה חדשה עבור ${p.name}`}
                      buttonClassName={btnSecondary}
                      className="mt-2 flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3"
                    >
                      <input type="hidden" name="userId" value={p.id} />
                      <Field label="סיסמה חדשה" name="password" type="text" required minLength={10} dir="ltr" autoComplete="off" />
                    </ActionForm>
                  </details>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
