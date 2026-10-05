import { serveVersionFile } from "@/lib/downloads";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return serveVersionFile((await params).id, "docx");
}
