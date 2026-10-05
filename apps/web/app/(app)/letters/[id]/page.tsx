import { canOnLetter, type LetterAction } from "@al/domain";
import { Building2, CalendarClock, ChevronLeft, FileText, GraduationCap, History as HistoryIcon, Layers, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { StagePill, Tag } from "@/components/Pills";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { AppError, userMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { liveFileStatus } from "@/lib/letters/live-file";
import { getLetterDetail, isOverdue } from "@/lib/letters/queries";
import { getDocumentHost } from "@/lib/m365/config";
import { ApproversPanel } from "./ApproversPanel";
import { History } from "./History";
import { StageStrip } from "./StageStrip";
import { Versions } from "./Versions";
import { ReviewRoom } from "./ReviewRoom";
import { WordFile } from "./WordFile";
import { WorkflowActions } from "./WorkflowActions";

export const metadata = { title: "מכתב · מכתבי קבלה" };

export default async function LetterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const actor = actorOf(user);
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await getLetterDetail(actor, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const { row, state, season, names } = detail;
  const can = (a: LetterAction) => canOnLetter(actor, a, state);
  const history = tab === "history";
  // "Edit in Word" only with Microsoft 365, and only while versions may be added (not once approved).
  const showWord = !history && getDocumentHost() !== null && can("UPLOAD_VERSION");
  const word = showWord
    ? await liveFileStatus(row).then(
        (status) => ({ status, error: null }),
        (e: unknown) => ({ status: null, error: userMessage(e) }),
      )
    : null;
  const name = (uid: string | null) => (uid && names.get(uid)) || "—";
  const roomComments = detail.comments.map((c, i) => ({
    id: c.id,
    n: i + 1,
    versionNumber: c.versionNumber,
    page: c.page,
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    status: c.status,
    body: c.body,
    author: name(c.authorId),
    createdAt: c.createdAt.toISOString(),
    hasSnapshot: Boolean(c.snapshotKey),
    fixedInVersion: c.fixedInVersion,
    replies: c.replies.map((r) => ({ id: r.id, author: name(r.authorId), body: r.body, createdAt: r.createdAt.toISOString() })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <nav aria-label="מיקום" className="text-sm text-muted">
          <Link href={`/seasons/${season.id}`} className="inline-flex min-h-9 items-center gap-1 hover:text-fg hover:underline">
            {season.name}
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
        </nav>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-bold">
            {row.trackName} <span className="tabular font-normal text-muted">({row.trackNumber})</span>
          </h1>
          <StagePill stage={row.stage} />
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {(
            [
              [Building2, "קמפוס", row.campus],
              [GraduationCap, "פקולטה", row.faculty],
              [UserRound, "יועצת בקרה", names.get(row.advisorId) ?? "—"],
              [Layers, "גרסה אחרונה", row.latestVersion ? `גרסה ${row.latestVersion}` : "אין עדיין"],
            ] as [LucideIcon, string, string][]
          ).map(([Icon, k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <dt className="flex items-center gap-1.5 text-muted">
                <Icon aria-hidden className="size-4" />
                {k}:
              </dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <dt className="flex items-center gap-1.5 text-muted">
              <CalendarClock aria-hidden className="size-4" />
              תאריך יעד:
            </dt>
            <dd>
              {isOverdue(row) ? <Tag tone="bad">באיחור · {formatDate(row.dueDate)}</Tag> : <span className="font-semibold">{formatDate(row.dueDate)}</span>}
            </dd>
          </div>
        </dl>
      </header>

      <StageStrip stage={row.stage} />

      <WorkflowActions detail={detail} can={can} />

      <nav aria-label="תצוגות המכתב" className="flex gap-1 border-b border-line">
        {[
          { href: `/letters/${row.id}`, label: "המכתב", icon: FileText, active: !history },
          { href: `/letters/${row.id}?tab=history`, label: "היסטוריה", icon: HistoryIcon, active: history },
        ].map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors duration-150 ${
              t.active ? "border-accent text-accent" : "border-transparent text-muted hover:border-line-strong hover:text-fg"
            }`}
          >
            <t.icon aria-hidden className="size-4" />
            {t.label}
          </Link>
        ))}
      </nav>

      {history ? (
        <History detail={detail} />
      ) : (
        <div className="flex flex-col gap-6">
          {word && (
            <WordFile
              letterId={row.id}
              webUrl={row.sharepointWebUrl}
              status={word.status}
              error={word.error}
              latestVersion={row.latestVersion}
            />
          )}
          <ReviewRoom
            letterId={row.id}
            versions={detail.versions.map((v) => ({ id: v.id, number: v.number }))}
            comments={roomComments}
            canComment={can("COMMENT")}
            canReply={can("REPLY")}
            canSetStatus={can("SET_COMMENT_STATUS")}
          />
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <ApproversPanel detail={detail} can={can} viewerId={user.id} />
            <Versions detail={detail} canUpload={can("UPLOAD_VERSION")} />
          </div>
        </div>
      )}
    </div>
  );
}
