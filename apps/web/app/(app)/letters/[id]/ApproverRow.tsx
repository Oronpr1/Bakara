"use client";

import { UserMinus, X } from "lucide-react";
import { useId, useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { TextAreaField } from "@/components/Field";
import { btnDanger, btnIcon } from "@/components/ui";
import { removeApproverAction } from "./actions";

/** One approver: name, role, state, and (for those allowed) a quiet control that opens the removal form. */
export function ApproverRow({
  name,
  sub,
  state,
  removed,
  remove,
}: {
  name: string;
  sub: string;
  state: React.ReactNode;
  removed: boolean;
  remove?: { letterId: string; userId: string; slot: string };
}) {
  const [asking, setAsking] = useState(false);
  const panel = useId();
  return (
    <li className="flex flex-col gap-2 py-2.5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
            removed ? "bg-surface-2 text-muted ring-1 ring-line" : "bg-accent-soft text-accent"
          }`}
        >
          {name.replace(/^(ד"ר|פרופ'|פרופ׳)\s*/, "").charAt(0)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={removed ? "text-muted line-through" : "font-semibold"}>{name}</span>
          <span className="text-xs text-muted">{sub}</span>
        </span>
        <span className="shrink-0">{state}</span>
        {remove && (
          <button
            type="button"
            className={`${btnIcon} hover:bg-bad-soft hover:text-bad`}
            aria-label={asking ? `ביטול הסרה של ${name}` : `הסר את ${name} מהתהליך`}
            title={asking ? "ביטול" : "הסרה מהתהליך"}
            aria-expanded={asking}
            aria-controls={panel}
            onClick={() => setAsking((v) => !v)}
          >
            {asking ? <X aria-hidden className="size-4" /> : <UserMinus aria-hidden className="size-4" />}
          </button>
        )}
      </div>
      {remove && asking && (
        <div id={panel} className="rounded-lg border border-bad/30 bg-bad-soft/40 p-3">
          <ActionForm
            action={removeApproverAction}
            submitLabel={`הסר את ${name}`}
            submitIcon={<UserMinus aria-hidden className="size-4" />}
            buttonClassName={btnDanger}
            className="flex flex-col gap-2"
          >
            <p className="text-sm font-semibold">הסרת {name} מהתהליך</p>
            <input type="hidden" name="letterId" value={remove.letterId} />
            <input type="hidden" name="userId" value={remove.userId} />
            <input type="hidden" name="slot" value={remove.slot} />
            <TextAreaField label="סיבה (נשמרת בהיסטוריה)" name="reason" required maxLength={2000} rows={2} autoFocus />
          </ActionForm>
        </div>
      )}
    </li>
  );
}
