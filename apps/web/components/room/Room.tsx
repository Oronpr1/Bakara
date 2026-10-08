"use client";

import { FileText, History, Layers, MessageSquare, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { btnPrimary, input } from "@/components/ui";
import type { RoomComment } from "@/lib/letters/queries";
import type { AcademicChoice } from "@/lib/room/queries";
import { shortName, type RoomProps } from "@/lib/room/view";
import { ActionBar } from "./ActionBar";
import { CommentsPanel, type DraftMark } from "./CommentsPanel";
import { PeoplePanel } from "./PeoplePanel";
import { Timeline } from "./Timeline";
import { Toaster } from "./Toast";
import { VersionsPanel } from "./VersionsPanel";
import { PENDING_ID, reviewComments, useDraftMarks } from "./marks";
import { Viewer, type MarkResult, type ViewerTool } from "./Viewer";

type Tab = "comments" | "people" | "time" | "versions";

function useIsDesktop() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

/** The review room below the header: the one action, the letter (PDF), and the side panel. */
export function Room({ room, choices, wordSlot }: { room: RoomProps; choices: { suggested: AcademicChoice[]; others: AcademicChoice[] }; wordSlot?: React.ReactNode }) {
  const latest = room.versions[0];
  const [tab, setTab] = useState<Tab>("comments");
  const [viewing, setViewing] = useState(latest?.number ?? 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<ViewerTool>("select");
  const [draft, setDraft] = useState<DraftMark | null>(null);
  const showResolved = false;
  const panelRef = useRef<HTMLElement>(null);
  const isDesktop = useIsDesktop();

  // A new upload moves the room to the new version.
  useEffect(() => {
    if (latest) setViewing(latest.number);
  }, [latest?.number]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      if (draft) URL.revokeObjectURL(draft.previewUrl);
    },
    [draft],
  );

  const version = room.versions.find((v) => v.number === viewing) ?? latest;
  const numbers = useMemo(() => new Map(room.comments.map((c, i) => [c.id, i + 1])), [room.comments]);
  const ordered = useMemo(() => [...room.comments].sort((a, b) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0)), [room.comments, numbers]);

  const boxes = useMemo(() => reviewComments(room.comments, numbers, version?.number, draft), [room.comments, numbers, draft, version?.number]);
  const { onUpdateDraft, onDelete } = useDraftMarks(room.id);

  function show(t: Tab) {
    setTab(t);
    if (!isDesktop) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function selectFromDoc(id: string) {
    if (id === PENDING_ID) return;
    setSelectedId(id);
    setTab("comments");
    requestAnimationFrame(() => panelRef.current?.querySelector(`[data-comment="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function selectFromList(c: RoomComment) {
    setViewing(c.versionNumber);
    setSelectedId(c.id);
    if (!isDesktop) requestAnimationFrame(() => document.getElementById("room-letter")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function onCreate(result: MarkResult) {
    setDraft({ ...result, previewUrl: URL.createObjectURL(result.snapshot) });
    setTool("select");
    setSelectedId(null);
    setTab("comments");
  }

  const canComment = room.can.comment;
  const isAdvisor = room.me.id === room.advisorId || room.extraPeople.some((p) => p.kind === "ADVISOR" && p.userId === room.me.id);
  const draftNotice = room.can.commentIsAdvisory
    ? "ההערה תתפרסם מיד ותגיע ליועצת. אין חובה להגיב או לאשר, והמכתב לא מחכה לך."
    : room.can.decide.length > 0
      ? "ההערה נשמרת כטיוטה. היא תפורסם כשתחליט (אשר או החזר לתיקון)."
      : isAdvisor
        ? "ההערה תתפרסם מיד."
        : `ההערה תתפרסם מיד, והמכתב יעבור ל${shortName(room.advisorName)} לתיקון.`;

  const openCount = room.comments.filter((c) => c.status === "OPEN").length;
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "comments", label: openCount ? `הערות (${openCount})` : "הערות", icon: <MessageSquare aria-hidden className="size-4" /> },
    { key: "people", label: "אנשים והחלטות", icon: <Users aria-hidden className="size-4" /> },
    { key: "time", label: "ציר זמן", icon: <History aria-hidden className="size-4" /> },
    { key: "versions", label: "גרסאות", icon: <Layers aria-hidden className="size-4" /> },
  ];

  return (
    <>
      <ActionBar room={room} choices={choices} onShowComments={() => show("comments")} onShowVersions={() => show("versions")} />

      <div className="grid gap-4 pb-36 lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-start lg:pb-0">
        <section id="room-letter" aria-label="המכתב" className="flex min-w-0 scroll-mt-2 flex-col gap-2">
          {version ? (
            <>
              {room.versions.length > 1 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <span className="font-semibold">גרסה</span>
                    <select
                      className={`${input} min-h-10 w-auto py-1.5`}
                      value={version.number}
                      onChange={(e) => {
                        setViewing(Number(e.currentTarget.value));
                        setSelectedId(null);
                      }}
                    >
                      {room.versions.map((v, i) => (
                        <option key={v.id} value={v.number}>
                          גרסה {v.number}
                          {i === 0 ? " (אחרונה)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {version.number !== latest?.number && <span className="font-semibold text-warn">מוצגת גרסה ישנה</span>}
                </div>
              )}
              <Viewer
                key={version.id}
                className="h-[calc(100dvh-9rem)] min-h-[420px] overflow-hidden rounded-xl border border-line bg-bg lg:h-[calc(100dvh-10rem)]"
                src={`/api/versions/${version.id}/pdf`}
                versionNumber={version.number}
                comments={boxes}
                selectedId={selectedId}
                onSelect={selectFromDoc}
                onClearSelection={() => setSelectedId(null)}
                canDraw={canComment}
                tool={tool}
                onToolChange={setTool}
                onCreate={onCreate}
                onUpdateDraft={onUpdateDraft}
                onDelete={onDelete}
                showResolved={showResolved || Boolean(selectedId)}
              />
            </>
          ) : (
            <EmptyState
              icon={FileText}
              title="עדיין אין גרסה של המכתב"
              action={
                room.can.uploadVersion ? (
                  <button type="button" className={btnPrimary} onClick={() => show("versions")}>
                    <Layers aria-hidden className="size-4" />
                    להעלאת גרסה
                  </button>
                ) : undefined
              }
            >
              {room.can.uploadVersion ? "מעלים את ה-PDF של המכתב בלשונית \"גרסאות\", והוא יוצג כאן." : `${shortName(room.advisorName)} עוד לא העלתה גרסה.`}
            </EmptyState>
          )}
        </section>

        <section
          ref={panelRef}
          aria-label="פרטי המכתב"
          className="flex min-w-0 scroll-mt-2 flex-col gap-3 rounded-xl border border-line bg-surface p-3 shadow-card lg:order-first lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
        >
          <div role="tablist" aria-label="תצוגות" className="grid grid-cols-4 gap-1 rounded-lg bg-surface-2 p-1 ring-1 ring-line">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls={`panel-${t.key}`}
                onClick={() => setTab(t.key)}
                className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-xs font-semibold transition-colors duration-150 sm:flex-row sm:gap-1.5 ${
                  tab === t.key ? "bg-surface text-accent shadow-card" : "text-muted hover:text-fg"
                }`}
              >
                {t.icon}
                <span className="text-center leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-w-0">
            {tab === "comments" && (
              <CommentsPanel
                letterId={room.id}
                meId={room.me.id}
                comments={ordered}
                numbers={numbers}
                selectedId={selectedId}
                onSelect={selectFromList}
                draft={draft}
                onDraftDone={() => setDraft(null)}
                onStartMark={() => {
                  setTool("NOTE");
                  if (!isDesktop) document.getElementById("room-letter")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                can={{
                  comment: canComment && Boolean(version),
                  handle: room.can.handleComments,
                  reopenAny: room.can.overrideOpenComments,
                  closed: room.phase === "APPROVED",
                }}
                draftNotice={draftNotice}
                isDesktop={isDesktop}
              />
            )}
            {tab === "people" && <PeoplePanel room={room} choices={choices} onShowVersions={() => show("versions")} />}
            {tab === "time" && <Timeline history={room.history} names={room.names} />}
            {tab === "versions" && (
              <VersionsPanel
                room={room}
                viewing={version?.number ?? 0}
                onView={(n) => {
                  setViewing(n);
                  setSelectedId(null);
                  if (!isDesktop) document.getElementById("room-letter")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                wordSlot={wordSlot}
              />
            )}
          </div>
        </section>
      </div>
      <Toaster />
    </>
  );
}
