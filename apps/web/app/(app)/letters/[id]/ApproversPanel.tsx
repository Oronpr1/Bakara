import { SLOT_LABELS, stageIndex, roundOfSlot, type ApproverSlot, type LetterAction } from "@al/domain";
import { CircleCheck, CircleDashed, Clock, TriangleAlert, UserCog, UserX } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { SelectField } from "@/components/Field";
import { btnSecondary, card, summary } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { usersWithRole, type LetterDetail, type UserOption } from "@/lib/letters/queries";
import { addAcademicAction, changeAdvisorAction, replaceApproverAction } from "./actions";
import { ApproverRow } from "./ApproverRow";
import { IconTag, SummaryChevron } from "./bits";

type Assignment = LetterDetail["assignments"][number];

function approvalOf(detail: LetterDetail, a: Assignment) {
  return detail.approvals.find((x) => x.userId === a.userId && x.slot === a.slot);
}

function ApproverState({ detail, a, viewerId }: { detail: LetterDetail; a: Assignment; viewerId: string }) {
  if (a.removedAt)
    return (
      <span className="flex flex-col items-end gap-0.5 text-end">
        <IconTag icon={UserX}>הוסר</IconTag>
        {a.removedReason && <span className="max-w-48 text-xs text-muted">{a.removedReason}</span>}
      </span>
    );
  const approval = approvalOf(detail, a);
  if (approval)
    return approval.versionNumber < detail.row.latestVersion ? (
      <span className="flex flex-col items-end gap-0.5 text-end">
        <IconTag icon={TriangleAlert} tone="warn">
          אישר על גרסה {approval.versionNumber}
        </IconTag>
        <span className="text-xs text-warn">{a.userId === viewerId ? "השתנה מאז שאישרת" : "השתנה מאז"}</span>
      </span>
    ) : (
      <IconTag icon={CircleCheck} tone="good">
        אישר · גרסה {approval.versionNumber}
      </IconTag>
    );
  const started = stageIndex(detail.row.stage) >= stageIndex(roundOfSlot(a.slot));
  return started ? (
    <IconTag icon={Clock} tone="warn">
      ממתין
    </IconTag>
  ) : (
    <IconTag icon={CircleDashed}>ממתין לסבב</IconTag>
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
      <input type="hidden" name="letterId" value={letterId} />
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
        const active = list.filter((a) => !a.removedAt);
        const done = active.filter((a) => (approvalOf(detail, a)?.versionNumber ?? -1) >= row.latestVersion).length;
        const now = round.slots.some((s) => roundOfSlot(s) === row.stage);
        return (
          <div key={round.title} className="flex flex-col">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-muted">
              {round.title}
              {now && <span className="rounded-full bg-accent-soft px-2 text-[11px] text-accent">עכשיו</span>}
              {active.length > 0 && (
                <span className="tabular ms-auto text-xs font-normal">
                  {done} מתוך {active.length} אישרו
                </span>
              )}
            </h3>
            {list.length === 0 ? (
              <p className="py-2 text-sm text-muted">אין מאשרים בסבב הזה.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {list.map((a) => {
                  const name = names.get(a.userId) ?? "—";
                  return (
                    <ApproverRow
                      key={a.id}
                      name={name}
                      sub={`${SLOT_LABELS[a.slot]}${a.removedAt ? ` · הוסר ב-${formatDate(a.removedAt)}` : ""}`}
                      state={<ApproverState detail={detail} a={a} viewerId={viewerId} />}
                      removed={Boolean(a.removedAt)}
                      remove={!a.removedAt && canRemove(a.slot) ? { letterId: row.id, userId: a.userId, slot: a.slot } : undefined}
                    />
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      {manage.length > 0 && (
        <details className="group rounded-lg border border-line px-3 py-1 open:pb-3">
          <summary className={summary}>
            <UserCog aria-hidden className="size-4" />
            שינוי אחראים
            <SummaryChevron />
          </summary>
          <div className="mt-2 flex flex-col gap-4">{manage}</div>
        </details>
      )}
    </section>
  );
}
