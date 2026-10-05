import { ActionForm } from "@/components/ActionForm";
import { TextAreaField } from "@/components/Field";
import { btnLink, btnPrimary, btnSecondary, card, hint } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { LiveFileStatus } from "@/lib/letters/live-file";
import { wordDesktopUrl } from "@/lib/m365/documents";
import { openInWordAction, versionFromSharePointAction } from "./actions";

/**
 * The letter's working file in SharePoint, for the advisor and the control manager. Shown only
 * when Microsoft 365 is configured and versions may still be added (so not after approval).
 */
export function WordFile({
  letterId,
  webUrl,
  status,
  error,
  latestVersion,
}: {
  letterId: string;
  /** Stored link to the file, or null when it was not created yet. */
  webUrl: string | null;
  status: LiveFileStatus | null;
  /** Why the file's state could not be read from SharePoint just now. */
  error: string | null;
  latestVersion: number;
}) {
  return (
    <section aria-labelledby="word-h" className={`${card} flex flex-col gap-3`}>
      <h2 id="word-h" className="font-bold">
        עריכה ב-Word
      </h2>
      {!webUrl ? (
        <>
          <p className="text-sm text-muted">
            עדיין אין למכתב קובץ עבודה ב-SharePoint.{" "}
            {latestVersion > 0 ? `הקובץ ייווצר מגרסה ${latestVersion}.` : "הקובץ ייווצר כדף ריק."}
          </p>
          <ActionForm action={openInWordAction} submitLabel="צור קובץ לעריכה ב-Word" pendingLabel="יוצר…" inline>
            <input type="hidden" name="letterId" value={letterId} />
          </ActionForm>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a href={status?.desktopUrl ?? wordDesktopUrl(webUrl)} className={btnPrimary}>
              ערוך ב-Word
            </a>
            <a href={webUrl} className={btnLink} target="_blank" rel="noopener">
              פתח בדפדפן
            </a>
            {status && (
              <span className={hint}>
                נשמר לאחרונה ב-SharePoint {formatDateTime(status.lastModifiedAt)}
                {status.lastModifiedBy && ` · ${status.lastModifiedBy}`}
              </span>
            )}
          </div>
          {error && (
            <p className="text-sm text-bad" role="alert">
              {error}
            </p>
          )}
          {status?.changed && (
            <div className="flex flex-col gap-3 rounded-lg border border-warn/40 bg-warn-soft p-3">
              <p className="font-semibold text-warn">יש שינויים ב-Word שלא נשמרו כגרסה</p>
              <ActionForm
                action={versionFromSharePointAction}
                submitLabel={`צור גרסה ${latestVersion + 1} מ-SharePoint`}
                pendingLabel="יוצר גרסה…"
                buttonClassName={btnSecondary}
              >
                <input type="hidden" name="letterId" value={letterId} />
                <p className={hint}>
                  המערכת לוקחת את הקובץ כפי שנשמר ב-SharePoint ומפיקה ממנו PDF. אם הקובץ פתוח ב-Word, ודאו שהשינויים
                  נשמרו לפני כן.
                </p>
                <TextAreaField label="מה השתנה בגרסה (לא חובה)" name="note" maxLength={2000} />
              </ActionForm>
            </div>
          )}
        </>
      )}
    </section>
  );
}
