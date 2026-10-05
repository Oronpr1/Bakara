import { FileDown, FileText, FileUp, Star, Upload } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { card, summary } from "@/components/ui";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { LetterDetail } from "@/lib/letters/queries";
import { btnSmall, IconTag, SummaryChevron } from "./bits";
import { UploadForm } from "./UploadForm";

const SOURCE_LABELS = { ADDIN: "מתוסף Word", UPLOAD: "העלאה ידנית", GRAPH: "מ-SharePoint" } as const;

export function Versions({ detail, canUpload }: { detail: LetterDetail; canUpload: boolean }) {
  const { versions, names, row } = detail;
  return (
    <section aria-labelledby="versions-h" className={`${card} flex flex-col gap-4`}>
      <h2 id="versions-h" className="font-bold">
        גרסאות
      </h2>
      {versions.length === 0 ? (
        <EmptyState icon={FileUp} title="עדיין לא הועלתה גרסה">
          {canUpload ? "מעלים Word ו-PDF, והמכתב מוצג למאשרים להערות." : "היועצת תעלה את הגרסה הראשונה."}
        </EmptyState>
      ) : (
        <ol className="flex flex-col gap-2">
          {versions.map((v) => {
            const latest = v.number === row.latestVersion;
            return (
              <li
                key={v.id}
                className={`flex flex-col gap-2 rounded-lg border p-3 ${latest ? "border-accent/40 bg-accent-soft/40" : "border-line"}`}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">גרסה {v.number}</span>
                  {latest && (
                    <IconTag icon={Star} tone="accent">
                      אחרונה
                    </IconTag>
                  )}
                  <span className="ms-auto text-xs text-muted">
                    {names.get(v.createdBy) ?? "—"} · {formatDateTime(v.createdAt)} · {SOURCE_LABELS[v.pdfSource]}
                  </span>
                </div>
                {v.note && <p className="text-sm">{v.note}</p>}
                <div className="flex flex-wrap gap-2">
                  <a href={`/api/versions/${v.id}/docx`} className={btnSmall} download>
                    <FileDown aria-hidden className="size-4" />
                    הורד Word <span className="text-xs font-normal text-muted">({formatBytes(v.docxSize)})</span>
                  </a>
                  <a href={`/api/versions/${v.id}/pdf`} className={btnSmall} target="_blank" rel="noopener">
                    <FileText aria-hidden className="size-4" />
                    פתח PDF <span className="text-xs font-normal text-muted">({v.pageCount} עמ׳)</span>
                    <span className="sr-only">(נפתח בלשונית חדשה)</span>
                  </a>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {canUpload && (
        <details className="group rounded-lg border border-line px-3 py-1 open:pb-3" open={versions.length === 0}>
          <summary className={summary}>
            <Upload aria-hidden className="size-4" />
            העלאת גרסה חדשה
            <SummaryChevron />
          </summary>
          <div className="mt-2">
            <UploadForm letterId={row.id} nextNumber={row.latestVersion + 1} />
          </div>
        </details>
      )}
    </section>
  );
}
