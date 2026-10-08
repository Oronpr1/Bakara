import { currentUser } from "@/lib/auth/session";
import { sampleTracksXlsx } from "@/lib/import/sample";

/** The example file for the track import ("הורד קובץ לדוגמה"). For signed-in people only. */
export async function GET() {
  if (!(await currentUser())) return new Response("צריך להתחבר", { status: 401 });
  const bytes = await sampleTracksXlsx();
  const name = "דוגמה לייבוא מסלולים.xlsx";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tracks-example.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
