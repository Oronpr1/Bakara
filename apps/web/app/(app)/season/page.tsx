import { redirect } from "next/navigation";
import { currentSeason } from "@/lib/season-context";

/** "מכתבי העונה": the dashboard of the season chosen in the header. */
export default async function CurrentSeasonPage() {
  const { current } = await currentSeason();
  redirect(current ? `/seasons/${current.id}` : "/seasons");
}
