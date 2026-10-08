import { redirect } from "next/navigation";

/** Season settings moved into the settings area. Old links land there. */
export default function SeasonsPage() {
  redirect("/settings/seasons");
}
