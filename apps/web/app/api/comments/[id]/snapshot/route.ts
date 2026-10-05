import { serveCommentSnapshot } from "@/lib/downloads";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return serveCommentSnapshot((await params).id);
}
