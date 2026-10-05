import { btnLink } from "@/components/ui";

/**
 * PLACEHOLDER: the PDF viewer with area marking and comment drawing mounts here (separate
 * package, next phase). Keep the element id stable: the viewer looks for #letter-viewer.
 */
export function ViewerPlaceholder({ pdfHref }: { pdfHref?: string }) {
  return (
    <section
      id="letter-viewer"
      aria-label="צפייה במכתב"
      data-viewer-mount
      className="grid min-h-48 place-items-center rounded-xl border-2 border-dashed border-line bg-surface p-6 text-center"
    >
      <div className="flex flex-col items-center gap-2">
        <p className="font-semibold">כאן תוצג הגרסה האחרונה, עם סימון אזורים והוספת הערות</p>
        <p className="text-sm text-muted">הצפייה והסימון על ה-PDF יתווספו בשלב הבא.</p>
        {pdfHref && (
          <a href={pdfHref} target="_blank" rel="noopener" className={btnLink}>
            בינתיים: פתח את ה-PDF בלשונית חדשה
          </a>
        )}
      </div>
    </section>
  );
}
