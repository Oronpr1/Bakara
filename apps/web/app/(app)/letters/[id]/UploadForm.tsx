"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { TextAreaField } from "@/components/Field";
import { hint, input, label } from "@/components/ui";
import { uploadVersionAction } from "./actions";

const MAX_BYTES = 30 * 1024 * 1024;

function FileField({ name, text, accept, onError }: { name: string; text: string; accept: string; onError: (m: string | null) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={label}>{text}</span>
      <input
        type="file"
        name={name}
        accept={accept}
        required
        className={`${input} file:me-3 file:rounded file:border-0 file:bg-accent-soft file:px-3 file:py-1 file:font-semibold file:text-accent`}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          const tooBig = f && f.size > MAX_BYTES;
          e.currentTarget.setCustomValidity(tooBig ? "הקובץ גדול מ-30MB" : "");
          onError(tooBig ? `${f.name} גדול מ-30MB` : null);
        }}
      />
    </label>
  );
}

/** Upload of a new official version: the DOCX and its PDF, checked for size before sending. */
export function UploadForm({ letterId, nextNumber }: { letterId: string; nextNumber: number }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <ActionForm action={uploadVersionAction} submitLabel={`העלה גרסה ${nextNumber}`} pendingLabel="מעלה…" className="flex flex-col gap-3">
      <input type="hidden" name="letterId" value={letterId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FileField name="docx" text="קובץ Word (DOCX)" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onError={setError} />
        <FileField name="pdf" text="קובץ PDF" accept=".pdf,application/pdf" onError={setError} />
      </div>
      <p className={hint}>כל קובץ עד 30MB. ה-PDF הוא מה שהמאשרים רואים ומעירים עליו.</p>
      <TextAreaField label="מה השתנה בגרסה (לא חובה)" name="note" maxLength={2000} />
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
    </ActionForm>
  );
}
