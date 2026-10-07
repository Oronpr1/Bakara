import { redirect } from "next/navigation";

/**
 * There is no "campuses and faculties" tab any more: every track is assigned on its own, in
 * "מסלולים והקצאות". Old links and bookmarks to this address land there instead of a dead end.
 */
export default function UnitsMoved() {
  redirect("/settings/tracks");
}
