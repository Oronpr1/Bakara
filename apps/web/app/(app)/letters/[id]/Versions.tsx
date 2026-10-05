import { btnLink, card } from "@/components/ui";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { LetterDetail } from "@/lib/letters/queries";
import { UploadForm } from "./UploadForm";

const SOURCE_LABELS = { ADDIN: "מתוסף Word", UPLOAD: "העלאה ידנית", GRAPH: "המרה אוטומטית" } as const;

export function Versions({ detail, canUpload }: { detail: LetterDetail; canUpload: boolean }) {
  const { versions, names, row } = detail;
  return (
    <section aria-labelledby="versions-h" className={`${card} flex flex-col gap-4`}>
      <h2 id="versions-h" className="font-bold">
        גרסאות
      </h2>
      {versions.length === 0 ? (
        <p className="text-sm text-muted">עדיין לא הועלתה גרסה.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-col gap-1 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">
                  גרסה {v.number}
                  {v.number === row.latestVersion && <span className="ms-2 text-xs font-normal text-good">אחרונה</span>}
                </span>
                <span className="text-xs text-muted">
                  {names.get(v.createdBy) ?? "—"} · {formatDateTime(v.createdAt)}
                </span>
              </div>
              {v.note && <p className="text-sm">{v.note}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <a href={`/api/versions/${v.id}/docx`} className={btnLink} download>
                  הורד Word <span className="text-xs text-muted">({formatBytes(v.docxSize)})</span>
                </a>
                <a href={`/api/versions/${v.id}/pdf`} className={btnLink} target="_blank" rel="noopener">
                  פתח PDF <span className="text-xs text-muted">({v.pageCount} עמ׳)</span>
                </a>
                <span className="text-xs text-muted">{SOURCE_LABELS[v.pdfSource]}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {canUpload && (
        <details className="rounded-lg border border-line p-3" open={versions.length === 0}>
          <summary className="cursor-pointer font-semibold text-accent">העלאת גרסה חדשה</summary>
          <div className="mt-3">
            <UploadForm letterId={row.id} nextNumber={row.latestVersion + 1} />
          </div>
        </details>
      )}
    </section>
  );
}
