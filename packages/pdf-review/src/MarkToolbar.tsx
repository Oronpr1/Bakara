"use client";
import { useEffect, useRef, useState } from "react";
import { ICONS, Icon } from "./icons";
import { COLOR_NAMES, MARK_COLORS, type MarkKind } from "./marks";

export type ViewerTool = "select" | MarkKind;

export interface MarkToolbarProps {
  tool: ViewerTool;
  onTool: (tool: ViewerTool) => void;
  /** The colour shown as chosen: the selected draft's, or the next mark's. */
  color: string;
  onColor: (color: string) => void;
  /** A draft of mine is selected: it can be deleted. */
  canDelete: boolean;
  onDelete: () => void;
}

const TOOLS: Array<{ tool: ViewerTool; label: string; title: string; icon: string }> = [
  { tool: "select", label: "בחירה", title: "בחירה ועריכה", icon: ICONS.select },
  { tool: "NOTE", label: "פתק", title: "פתק: הקשה על המקום", icon: ICONS.note },
  { tool: "X", label: "X", title: "סימון X: הקשה או גרירה", icon: ICONS.x },
  { tool: "LINE", label: "קו", title: "קו: גרירה מנקודה לנקודה", icon: ICONS.line },
];

/**
 * The marking tools: select/edit, note, X, line; the colour palette (inline
 * on a wide screen, behind one button on a phone); and delete for a selected
 * draft.
 */
export function MarkToolbar(p: MarkToolbarProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setPaletteOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [paletteOpen]);

  return (
    <div className="alpr-toolbar" role="toolbar" aria-label="כלי סימון">
      <div className="alpr-group" role="group" aria-label="כלי">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            type="button"
            className="alpr-btn alpr-tool"
            data-tool={t.tool}
            aria-pressed={p.tool === t.tool}
            aria-label={t.tool === "X" ? "סימון X" : t.label}
            title={t.title}
            onClick={() => p.onTool(t.tool)}
          >
            <Icon d={t.icon} />
            <span className="alpr-btn-text">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="alpr-group alpr-color-wrap" ref={wrap} data-open={paletteOpen || undefined}>
        <button
          type="button"
          className="alpr-btn alpr-color-toggle"
          aria-label={`צבע: ${COLOR_NAMES[p.color] ?? "צבע"}`}
          aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen((o) => !o)}
        >
          <span className="alpr-swatch" style={{ background: p.color }} aria-hidden="true" />
        </button>
        <div className="alpr-palette" role="radiogroup" aria-label="צבע הסימון">
          {MARK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              className="alpr-btn alpr-swatch-btn"
              aria-checked={p.color === c}
              aria-label={COLOR_NAMES[c] ?? c}
              title={COLOR_NAMES[c]}
              onClick={() => {
                p.onColor(c);
                setPaletteOpen(false);
              }}
            >
              <span className="alpr-swatch" style={{ background: c }} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      {p.canDelete && (
        <div className="alpr-group">
          <button
            type="button"
            className="alpr-btn alpr-delete"
            aria-label="מחיקת הסימון"
            title="מחיקת הסימון (Delete)"
            onClick={p.onDelete}
          >
            <Icon d={ICONS.trash} />
            <span className="alpr-btn-text">מחיקה</span>
          </button>
        </div>
      )}
    </div>
  );
}
