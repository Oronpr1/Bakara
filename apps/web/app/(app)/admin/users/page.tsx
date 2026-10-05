import { canGlobal, ROLE_LABELS, ROLES } from "@al/domain";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { CheckboxGroup, Field } from "@/components/Field";
import { Tag } from "@/components/Pills";
import { btnDanger, btnSecondary, card } from "@/components/ui";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/letters/queries";
import { createUserAction, setActiveAction, setRolesAction } from "./actions";

export const metadata = { title: "משתמשים · מכתבי קבלה" };

const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export default async function UsersPage() {
  const user = await requireUser();
  if (!canGlobal(actorOf(user), "MANAGE_USERS")) notFound();
  const people = await listUsers();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">משתמשים</h1>
        <p className="text-sm text-muted">משתמשים לא נמחקים. משתמש מושבת לא יכול להתחבר, וההיסטוריה שלו נשמרת.</p>
      </div>

      <section aria-labelledby="add-user" className={`${card} flex flex-col gap-4`}>
        <h2 id="add-user" className="text-lg font-bold">
          הוספת משתמש
        </h2>
        <ActionForm action={createUserAction} submitLabel="הוסף משתמש" pendingLabel="מוסיף…" className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="שם מלא" name="name" required maxLength={200} autoComplete="off" />
            <Field label="מייל" name="email" type="email" required dir="ltr" autoComplete="off" />
          </div>
          <CheckboxGroup legend="תפקידים" name="roles" options={roleOptions} />
        </ActionForm>
      </section>

      <section aria-labelledby="all-users" className="flex flex-col gap-3">
        <h2 id="all-users" className="text-lg font-bold">
          כל המשתמשים ({people.length})
        </h2>
        <ul className="flex flex-col gap-3">
          {people.map((p) => (
            <li key={p.id} className={`${card} flex flex-col gap-3 ${p.active ? "" : "opacity-75"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="flex items-center gap-2 font-semibold">
                    {p.name}
                    {!p.active && <Tag tone="bad">מושבת</Tag>}
                    {p.id === user.id && <Tag>זה את/ה</Tag>}
                  </span>
                  <bdi dir="ltr" className="text-sm text-muted">
                    {p.email}
                  </bdi>
                </div>
                {p.id !== user.id && (
                  <ActionForm
                    action={setActiveAction}
                    submitLabel={p.active ? `השבת את ${p.name}` : `הפעל מחדש את ${p.name}`}
                    buttonClassName={p.active ? btnDanger : btnSecondary}
                    confirm={p.active ? `להשבית את ${p.name}? הוא/היא לא יוכלו להתחבר.` : undefined}
                    inline
                  >
                    <input type="hidden" name="userId" value={p.id} />
                    <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                  </ActionForm>
                )}
              </div>
              <details>
                <summary className="cursor-pointer text-sm">
                  <span className="text-muted">תפקידים: </span>
                  {p.roles.length ? p.roles.map((r) => ROLE_LABELS[r]).join(", ") : "ללא"}
                  <span className="ms-2 font-semibold text-accent">עריכה</span>
                </summary>
                <ActionForm
                  action={setRolesAction}
                  submitLabel={`שמור תפקידים של ${p.name}`}
                  buttonClassName={btnSecondary}
                  className="mt-3 flex flex-col gap-3"
                >
                  <input type="hidden" name="userId" value={p.id} />
                  <CheckboxGroup legend={`תפקידים של ${p.name}`} name="roles" options={roleOptions} defaultChecked={p.roles} />
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
