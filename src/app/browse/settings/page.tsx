import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "~/server/better-auth/server";
import { MemoryGraphView } from "./_components/memory-graph-view";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <main
      className="flex h-screen flex-col bg-[#0C0F15] text-[#E4E2DC]"
      style={{ colorScheme: "dark" }}
    >
      {/* nav */}
      <nav className="flex shrink-0 items-center justify-between px-8 py-5">
        <Link
          href="/browse"
          className="font-[family-name:var(--font-syne)] text-lg font-bold lowercase tracking-tight transition-opacity hover:opacity-70"
        >
          cagesurf 🦜
        </Link>
        <Link
          href="/browse"
          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-base font-medium text-[#878A90] ring-1 ring-white/10 transition-all duration-200 hover:bg-[#E4E2DC] hover:text-[#0C0F15] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34D399]"
        >
          Back to conversations
        </Link>
      </nav>

      {/* content */}
      <div className="flex min-h-0 flex-1 flex-col px-8 pb-8">
        <div className="mb-6 shrink-0">
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold lowercase tracking-tight">
            your memory
          </h1>
          <p className="mt-1 text-base text-[#878A90]">
            Everything CageSurf remembers from your conversations.
          </p>
        </div>
        <div className="min-h-0 flex-1">
          <MemoryGraphView />
        </div>
      </div>
    </main>
  );
}
