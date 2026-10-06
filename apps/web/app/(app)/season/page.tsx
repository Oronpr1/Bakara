import { redirect } from "next/navigation";

/** "מכתבי העונה": every letter of the chosen season, on the home screen's list. */
export default function CurrentSeasonPage() {
  redirect("/?g=all#letters");
}
