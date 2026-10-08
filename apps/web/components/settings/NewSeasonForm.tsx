"use client";

import { ArrowLeft, CalendarPlus } from "lucide-react";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Field, SelectField } from "@/components/Field";
import type { ActionResult } from "@/lib/action-result";
import { DEFAULT_SEASON_SETTINGS, SeasonSettingsFields, type SeasonSettingsValues } from "./SeasonSettingsFields";

export interface BaseSeason {
  id: string;
  name: string;
  letterCount: number;
  /** One track code of that season, to show what the code change does. */
  sampleCode: string | null;
  settings: SeasonSettingsValues;
}

/** "227" → "228": the start of a code, one year on. */
function nextYear(prefix: string) {
  return /^\d+$/.test(prefix) ? String(Number(prefix) + 1).padStart(prefix.length, "0") : "";
}

/** Opening a season: empty, or on the basis of an earlier one with the track codes moved a year on. */
export function NewSeasonForm({
  action,
  seasons,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  seasons: BaseSeason[];
}) {
  const [baseId, setBaseId] = useState(seasons[0]?.id ?? "");
  const base = seasons.find((s) => s.id === baseId);
  const suggestFrom = base?.sampleCode?.slice(0, 3) ?? "";
  const [from, setFrom] = useState(suggestFrom);
  const [to, setTo] = useState(nextYear(suggestFrom));

  function chooseBase(id: string) {
    setBaseId(id);
    const s = seasons.find((x) => x.id === id);
    const prefix = s?.sampleCode?.slice(0, 3) ?? "";
    setFrom(prefix);
    setTo(nextYear(prefix));
  }

  const sample = base?.sampleCode;
  const renamed = sample && from && sample.startsWith(from) ? to + sample.slice(from.length) : sample;

  return (
    <ActionForm
      action={action}
      submitLabel="פתח את העונה"
      submitIcon={<CalendarPlus aria-hidden className="size-4" />}
      pendingLabel="פותח…"
      className="flex flex-col gap-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="שם העונה" name="name" required maxLength={100} placeholder={`תשפ"ח א'`} />
        <SelectField
          label="על בסיס עונה קודמת"
          name="copyFromSeasonId"
          value={baseId}
          onChange={(e) => chooseBase(e.target.value)}
          placeholder="לא, עונה ריקה"
          options={seasons.map((s) => ({ value: s.id, label: `${s.name} (${s.letterCount} מסלולים)` }))}
        />
      </div>

      {base ? (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3">
          <legend className="px-1 text-sm font-semibold">החלפת תחילת קוד המסלול</legend>
          <p className="text-sm text-muted">
            כל <span className="tabular">{base.letterCount}</span> המסלולים של {base.name} יועתקו לעונה החדשה, עם היועצת שלהם (או יועצת ברירת
            המחדל של הקמפוס והפקולטה). בלי גרסאות, הערות ואישורים. המכתב המאושר של השנה שעברה יופיע בכל מסלול כנקודת פתיחה.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Field
              label="קוד שמתחיל ב-"
              name="codeFrom"
              value={from}
              onChange={(e) => setFrom(e.target.value.trim())}
              inputMode="numeric"
              dir="ltr"
              maxLength={6}
              className="w-32"
            />
            <ArrowLeft aria-hidden className="mb-3 size-5 text-muted" />
            <Field
              label="יתחיל ב-"
              name="codeTo"
              value={to}
              onChange={(e) => setTo(e.target.value.trim())}
              inputMode="numeric"
              dir="ltr"
              maxLength={6}
              className="w-32"
            />
          </div>
          {sample && (
            <p className="text-sm" aria-live="polite">
              לדוגמה: <bdi className="tabular">{sample}</bdi> יהיה <bdi className="tabular font-semibold">{renamed}</bdi>.
              {from && !sample.startsWith(from) && <span className="text-warn"> (הקוד לדוגמה לא מתחיל ב-{from}, ולכן לא ישתנה)</span>}
            </p>
          )}
          <p className="text-xs text-muted">משאירים את שני השדות ריקים כדי להשאיר את הקודים כמו שהם.</p>
        </fieldset>
      ) : (
        <p className="text-sm text-muted">עונה ריקה: מוסיפים את המסלולים אחר כך, אחד אחד או מקובץ, בלשונית &quot;מסלולים והקצאות&quot;.</p>
      )}

      <SeasonSettingsFields key={baseId} values={base?.settings ?? DEFAULT_SEASON_SETTINGS} />
      <p className="text-sm text-muted">אחרי הפתיחה המערכת עוברת לעונה החדשה (אפשר לחזור לעונה אחרת בראש המסך).</p>
    </ActionForm>
  );
}
