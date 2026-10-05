import { canOnLetter, type LetterAction } from "@al/domain";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { StagePill, Tag } from "@/components/Pills";
import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { getLetterDetail, isOverdue, waitingOn } from "@/lib/letters/queries";
import { ApproversPanel } from "./ApproversPanel";
import { History } from "./History";
import { StageStrip } from "./StageStrip";
import { Versions } from "./Versions";
import { ReviewRoom } from "./ReviewRoom";
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
        <p className="text-sm text-muted">
          <Link href={`/seasons/${season.id}`} className="hover:underline">
            {season.name}
          </Link>{" "}
          /
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">
            {row.trackName} <span className="tabular font-normal text-muted">({row.trackNumber})</span>
          </h1>
          <StagePill stage={row.stage} />
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[
            ["קמפוס", row.campus],
            ["פקולטה", row.faculty],
            ["יועצת בקרה", names.get(row.advisorId) ?? "—"],
            ["גרסה אחרונה", row.latestVersion ? `גרסה ${row.latestVersion}` : "אין עדיין"],
            ["ממתין ל", waitingOn(state, names)],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-1.5">
              <dt className="text-muted">{k}:</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
          <div className="flex gap-1.5">
            <dt className="text-muted">תאריך יעד:</dt>
            <dd>
              {isOverdue(row) ? <Tag tone="bad">באיחור · {formatDate(row.dueDate)}</Tag> : <span className="font-semibold">{formatDate(row.dueDate)}</span>}
            </dd>
          </div>
        </dl>
      </header>

      <StageStrip stage={row.stage} />

      <nav aria-label="תצוגות המכתב" className="flex gap-1 border-b border-line">
        {[
          { href: `/letters/${row.id}`, label: "המכתב", active: !history },
          { href: `/letters/${row.id}?tab=history`, label: "היסטוריה", active: history },
        ].map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              t.active ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {history ? (
        <History detail={detail} />
      ) : (
        <div className="flex flex-col gap-6">
          <WorkflowActions detail={detail} can={can} />
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
