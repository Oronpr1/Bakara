// "ייצוא לאקסל": the home screen's letter list, with the same filters (from the address), as CSV.
import { actorOf } from "@/lib/actor";
import { currentUser } from "@/lib/auth/session";
import { lettersCsv } from "@/lib/home/csv";
import { applyFilters, defaultGroup, parseFilters, personaOf, sortItems } from "@/lib/home/model";
import { getHomeView } from "@/lib/home/queries";
import { contentDisposition } from "@/lib/http";
import { currentSeason } from "@/lib/season-context";

const plain = (status: number, text: string) =>
  new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return plain(401, "צריך להתחבר");
  const { current } = await currentSeason();
  if (!current) return plain(404, "עדיין לא נפתחה עונת רישום");
  try {
    const { letters, season } = await getHomeView(actorOf(user), current.id);
    const filters = parseFilters(Object.fromEntries(new URL(req.url).searchParams));
    const group = filters.g ?? defaultGroup(personaOf(user.roles, user.id, letters));
    const rows = sortItems(applyFilters(letters, filters, user.id, group), filters.sort);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(lettersCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(`מכתבי קבלה - ${season.name} - ${day}.csv`),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error(err);
    return plain(500, "משהו השתבש");
  }
}
