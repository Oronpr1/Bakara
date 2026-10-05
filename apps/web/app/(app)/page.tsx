import { requireUser } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await requireUser();
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">שלום {user.name}</h1>
      <p className="text-muted">כאן יופיעו עונות הרישום והמכתבים שממתינים לך.</p>
    </section>
  );
}
