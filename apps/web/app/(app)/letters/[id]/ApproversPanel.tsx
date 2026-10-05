import { SLOT_LABELS, stageIndex, roundOfSlot, type ApproverSlot, type LetterAction } from "@al/domain";
import { ActionForm } from "@/components/ActionForm";
import { SelectField, TextAreaField } from "@/components/Field";
import { Tag } from "@/components/Pills";
import { btnDanger, btnSecondary, card } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { usersWithRole, type LetterDetail, type UserOption } from "@/lib/letters/queries";
import { addAcademicAction, changeAdvisorAction, removeApproverAction, replaceApproverAction } from "./actions";

type Assignment = LetterDetail["assignments"][number];

function ApproverState({ detail, a, viewerId }: { detail: LetterDetail; a: Assignment; viewerId: string }) {
  if (a.removedAt)
    return (
      <span className="flex flex-col items-end gap-0.5 text-end">
        <Tag>הוסר</Tag>
        {a.removedReason && <span className="text-xs text-muted">{a.removedReason}</span>}
      </span>
    );
  const approval = detail.approvals.find((x) => x.userId === a.userId && x.slot === a.slot);
  if (approval)
    return approval.versionNumber < detail.row.latestVersion ? (
      <span className="flex flex-col items-end gap-0.5 text-end">
        <Tag tone="warn">אישר על גרסה {approval.versionNumber}</Tag>
        <span className="text-xs text-warn">{a.userId === viewerId ? "השתנה מאז שאישרת" : "השתנה מאז"}</span>
      </span>
    ) : (
      <Tag tone="good">אישר · גרסה {approval.versionNumber}</Tag>
    );
  const started = stageIndex(detail.row.stage) >= stageIndex(roundOfSlot(a.slot));
  return <Tag tone={started ? "warn" : "muted"}>{started ? "ממתין" : "ממתין לסבב"}</Tag>;
}

function Hidden({ letterId }: { letterId: string }) {
  return <input type="hidden" name="letterId" value={letterId} />;
}

function RemoveForm({ detail, a, name }: { detail: LetterDetail; a: Assignment; name: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-bad">הסר מהתהליך</summary>
      <ActionForm action={removeApproverAction} submitLabel={`הסר את ${name}`} buttonClassName={btnDanger} className="mt-2 flex flex-col gap-2">
        <Hidden letterId={detail.row.id} />
        <input type="hidden" name="userId" value={a.userId} />
        <input type="hidden" name="slot" value={a.slot} />
        <TextAreaField label="סיבה" name="reason" required maxLength={2000} />
      </ActionForm>
    </details>
  );
}

function PersonPicker({
  action,
  label,
  submitLabel,
  people,
  letterId,
  name = "userId",
  extra,
}: {
  action: Parameters<typeof ActionForm>[0]["action"];
  label: string;
  submitLabel: string;
  people: UserOption[];
  letterId: string;
  name?: string;
  extra?: React.ReactNode;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} buttonClassName={btnSecondary} inline className="flex flex-col gap-2">
      <Hidden letterId={letterId} />
      {extra}
      <SelectField label={label} name={name} required placeholder="בחרו" options={people.map((p) => ({ value: p.id, label: p.name }))} />
    </ActionForm>
  );
}

const ROUNDS: { title: string; slots: ApproverSlot[] }[] = [
  { title: "סבב רישום", slots: ["REGISTRATION_MANAGER", "VP_REGISTRATION"] },
  { title: "סבב אקדמי", slots: ["ACADEMIC"] },
];

/** Who approves this letter in each round, their state, and changes to the list. */
export function ApproversPanel({
  detail,
  can,
  viewerId,
}: {
  detail: LetterDetail;
  can: (a: LetterAction) => boolean;
  viewerId: string;
}) {
  const { row, people, names } = detail;
  const activeIds = (slot: ApproverSlot) => detail.assignments.filter((a) => a.slot === slot && !a.removedAt).map((a) => a.userId);
  const canRemove = (slot: ApproverSlot) => can("REMOVE_APPROVER") || (slot === "ACADEMIC" && can("SET_ACADEMIC_APPROVERS"));

  const manage: React.ReactNode[] = [];
  if (can("SET_REGISTRATION_MANAGER"))
    manage.push(
      <PersonPicker
        key="rm"
        action={replaceApproverAction}
        label="מנהל רישום"
        submitLabel="החלף מנהל רישום"
        letterId={row.id}
        people={usersWithRole(people, "REGISTRATION_MANAGER").filter((p) => !activeIds("REGISTRATION_MANAGER").includes(p.id))}
        extra={<input type="hidden" name="slot" value="REGISTRATION_MANAGER" />}
      />,
    );
  if (can("REMOVE_APPROVER"))
    manage.push(
      <PersonPicker
        key="vp"
        action={replaceApproverAction}
        label='סמנכ"ל רישום'
        submitLabel='החלף סמנכ"ל רישום'
        letterId={row.id}
        people={usersWithRole(people, "VP_REGISTRATION").filter((p) => !activeIds("VP_REGISTRATION").includes(p.id))}
        extra={<input type="hidden" name="slot" value="VP_REGISTRATION" />}
      />,
    );
  if (can("SET_ACADEMIC_APPROVERS"))
    manage.push(
      <PersonPicker
        key="ac"
        action={addAcademicAction}
        label="גורם אקדמי"
        submitLabel="הוסף גורם אקדמי"
        letterId={row.id}
        people={usersWithRole(people, "ACADEMIC_APPROVER").filter((p) => !activeIds("ACADEMIC").includes(p.id))}
      />,
    );
  if (can("CHANGE_ADVISOR"))
    manage.push(
      <PersonPicker
        key="adv"
        action={changeAdvisorAction}
        label="יועצת בקרה"
        name="advisorId"
        submitLabel="החלף יועצת"
        letterId={row.id}
        people={usersWithRole(people, "CONTROL_ADVISOR").filter((p) => p.id !== row.advisorId)}
      />,
    );

  return (
    <section aria-labelledby="approvers-h" className={`${card} flex flex-col gap-4`}>
      <h2 id="approvers-h" className="font-bold">
        מאשרים
      </h2>
      {ROUNDS.map((round) => {
        const list = detail.assignments.filter((a) => round.slots.includes(a.slot));
        return (
          <div key={round.title} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-muted">{round.title}</h3>
            {list.length === 0 ? (
              <p className="text-sm text-muted">אין מאשרים בסבב הזה.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {list.map((a) => {
                  const name = names.get(a.userId) ?? "—";
                  return (
                    <li key={a.id} className={`flex flex-col gap-1.5 py-2 ${a.removedAt ? "opacity-70" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex flex-col">
                          <span className={a.removedAt ? "line-through" : "font-semibold"}>{name}</span>
                          <span className="text-xs text-muted">
                            {SLOT_LABELS[a.slot]}
                            {a.removedAt && ` · הוסר ב-${formatDate(a.removedAt)}`}
                          </span>
                        </span>
                        <ApproverState detail={detail} a={a} viewerId={viewerId} />
                      </div>
                      {!a.removedAt && canRemove(a.slot) && <RemoveForm detail={detail} a={a} name={name} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      {manage.length > 0 && (
        <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer font-semibold text-accent">שינוי אחראים</summary>
          <div className="mt-3 flex flex-col gap-4">{manage}</div>
        </details>
      )}
    </section>
  );
}
