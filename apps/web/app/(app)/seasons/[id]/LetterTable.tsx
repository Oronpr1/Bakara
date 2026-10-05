import Link from "next/link";
import { StagePill, Tag } from "@/components/Pills";
import { formatDate } from "@/lib/format";
import type { LetterListItem } from "@/lib/letters/queries";

function Due({ item }: { item: LetterListItem }) {
  if (!item.row.dueDate) return <span className="text-muted">—</span>;
  return item.overdue ? (
    <Tag tone="bad">באיחור · {formatDate(item.row.dueDate)}</Tag>
  ) : (
    <span className="tabular">{formatDate(item.row.dueDate)}</span>
  );
}

function Comments({ n }: { n: number }) {
  return n > 0 ? <Tag tone="warn">{n}</Tag> : <span className="text-muted">0</span>;
}

/** Table on wide screens, stacked cards on phones. */
export function LetterTable({ items }: { items: LetterListItem[] }) {
  if (items.length === 0) return <p className="rounded-lg border border-dashed border-line p-6 text-center text-muted">אין דרישות להצגה.</p>;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface lg:block">
        <table className="w-full text-sm">
          <thead className="bg-bg text-start text-muted">
            <tr>
              {["מסלול", "מס'", "קמפוס", "פקולטה", "יועצת", "שלב", "גרסה", "הערות פתוחות", "תאריך יעד", "ממתין ל"].map(
                (h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 text-start font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.row.id} className="border-t border-line hover:bg-accent-soft/40">
                <td className="px-3 py-2.5">
                  <Link href={`/letters/${item.row.id}`} className="font-semibold text-accent hover:underline">
                    {item.row.trackName}
                  </Link>
                </td>
                <td className="tabular px-3 py-2.5">{item.row.trackNumber}</td>
                <td className="px-3 py-2.5">{item.row.campus}</td>
                <td className="px-3 py-2.5">{item.row.faculty}</td>
                <td className="px-3 py-2.5">{item.advisorName}</td>
                <td className="px-3 py-2.5">
                  <StagePill stage={item.row.stage} />
                </td>
                <td className="tabular px-3 py-2.5">{item.row.latestVersion ? `v${item.row.latestVersion}` : "—"}</td>
                <td className="px-3 py-2.5">
                  <Comments n={item.openComments} />
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <Due item={item} />
                </td>
                <td className="px-3 py-2.5">{item.waitingOn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 lg:hidden">
        {items.map((item) => (
          <li key={item.row.id} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/letters/${item.row.id}`} className="font-semibold text-accent hover:underline">
                {item.row.trackName} <span className="tabular font-normal text-muted">({item.row.trackNumber})</span>
              </Link>
              <StagePill stage={item.row.stage} />
            </div>
            <p className="mt-1 text-sm text-muted">
              {item.row.campus} · {item.row.faculty} · {item.advisorName}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-muted">גרסה</dt>
                <dd className="tabular">{item.row.latestVersion ? `v${item.row.latestVersion}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">הערות פתוחות</dt>
                <dd>
                  <Comments n={item.openComments} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">תאריך יעד</dt>
                <dd>
                  <Due item={item} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">ממתין ל</dt>
                <dd>{item.waitingOn}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
