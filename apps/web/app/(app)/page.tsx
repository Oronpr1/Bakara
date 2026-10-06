import { actorOf } from "@/lib/actor";
import { requireUser } from "@/lib/auth/session";
import { getHomeView } from "@/lib/home/queries";
import { currentSeason } from "@/lib/season-context";

export const metadata = { title: "העבודה שלי · מכתבי קבלה" };

export default async function HomePage() {
  const user = await requireUser();
  const { current } = await currentSeason();
  if (!current) return <h1 className="text-2xl font-bold">עדיין לא נפתחה עונת רישום</h1>;
  const view = await getHomeView(actorOf(user), current.id);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm font-semibold text-muted">{view.season.name}</p>
      <h1 className="text-2xl font-bold">שלום {user.name}</h1>
      <p className="tabular">{view.letters.length} מכתבים</p>
    </div>
  );
}
