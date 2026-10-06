"use client";
import { useState } from "react";
import { ICONS, Icon } from "./icons";
import { parseZoomInput } from "./layout";

export type FitMode = "width" | "page" | null;

export interface ZoomBarProps {
  zoom: number;
  fit: FitMode;
  onStep: (dir: 1 | -1) => void;
  onZoom: (zoom: number) => void;
  onFit: (mode: "width" | "page") => void;
  page: number;
  numPages: number;
  atStart: boolean;
  atEnd: boolean;
  onPage: (page: number) => void;
}

/**
 * The bottom bar: page (▲ ▼ 1 / 2) on the start side, zoom on the end side —
 * − [119%] + and "fit width" / "fit page", the way pdf-guard's status bar
 * lays it out (src/ui/Workspace.tsx .statusbar). The percentage is a field:
 * type a number and press Enter.
 */
export function ZoomBar(p: ZoomBarProps) {
  const [text, setText] = useState<string | null>(null);
  const shown = `${Math.round(p.zoom * 100)}%`;
  const apply = () => {
    if (text === null) return;
    const z = parseZoomInput(text);
    setText(null);
    if (z !== null) p.onZoom(z);
  };

  return (
    <div className="alpr-zoombar" role="toolbar" aria-label="תצוגה וזום">
      <div className="alpr-group alpr-pages-nav">
        <button
          type="button"
          className="alpr-btn alpr-nav-arrow"
          aria-label="עמוד קודם"
          disabled={!p.numPages || p.atStart}
          onClick={() => p.onPage(p.page - 1)}
        >
          <Icon d={ICONS.up} />
        </button>
        <button
          type="button"
          className="alpr-btn alpr-nav-arrow"
          aria-label="עמוד הבא"
          disabled={!p.numPages || p.atEnd || p.page >= p.numPages}
          onClick={() => p.onPage(p.page + 1)}
        >
          <Icon d={ICONS.down} />
        </button>
        <span className="alpr-page-now" dir="ltr" aria-live="polite">
          <span className="alpr-sr">עמוד </span>
          {p.page || "–"} / {p.numPages || "–"}
        </span>
      </div>
      <div className="alpr-group alpr-zoom-group" dir="ltr">
        <button type="button" className="alpr-btn" aria-label="הקטנה" onClick={() => p.onStep(-1)}>
          <Icon d={ICONS.minus} />
        </button>
        <input
          className="alpr-zoom-input"
          inputMode="decimal"
          enterKeyHint="done"
          aria-label="אחוז הגדלה"
          value={text ?? shown}
          onFocus={(e) => {
            setText(shown);
            e.currentTarget.select();
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setText(null);
              e.currentTarget.blur();
            }
          }}
        />
        <button type="button" className="alpr-btn" aria-label="הגדלה" onClick={() => p.onStep(1)}>
          <Icon d={ICONS.plus} />
        </button>
        <span className="alpr-sep" aria-hidden="true" />
        <button
          type="button"
          className="alpr-btn alpr-fit"
          aria-pressed={p.fit === "width"}
          aria-label="התאם לרוחב"
          title="התאם לרוחב"
          onClick={() => p.onFit("width")}
        >
          <Icon d={ICONS.fitWidth} />
          <span className="alpr-btn-text">התאם לרוחב</span>
        </button>
        <button
          type="button"
          className="alpr-btn alpr-fit"
          aria-pressed={p.fit === "page"}
          aria-label="התאם לעמוד"
          title="התאם לעמוד"
          onClick={() => p.onFit("page")}
        >
          <Icon d={ICONS.fitPage} />
          <span className="alpr-btn-text">התאם לעמוד</span>
        </button>
      </div>
    </div>
  );
}
