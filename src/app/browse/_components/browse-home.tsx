"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "~/server/better-auth/client";
import { api } from "~/trpc/react";
import Image from "next/image";
import Link from "next/link";
import { ArrowIcon } from "~/app/_components/arrow-icon";
import { SafetyCheckCard } from "./safety-check-card";

interface Conversation {
  id: string;
  title: string | null;
  lastVisitedUrl: string | null;
  lastScreenshotUrl: string | null;
  createdAt: Date;
}

const quickActions = [
  {
    title: "Open a website safely",
    description: "Tell Cage Surf where you want to go, and it will guide you step by step.",
  },
  {
    title: "Check if a message is a scam",
    description: "Paste a text, payment request, or support message before you respond.",
  },
  {
    title: "Help me fill a form",
    description: "Get calm, simple guidance for confusing forms, logins, and service pages.",
  },
];

export function BrowseHome({
  conversations,
}: {
  conversations: Conversation[];
}) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);

  const createConversation = api.conversation.create.useMutation({
    onSuccess: (data) => {
      setIsNavigating(true);
      router.push(`/browse/${data.id}`);
    },
  });

  const isStarting = createConversation.isPending || isNavigating;

  return (
    <main
      className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.08),_transparent_28%),_#0C0F15] text-[#E4E2DC]"
      style={{ colorScheme: "dark" }}
    >
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5 md:px-8">
        <div className="flex flex-col">
          <span className="font-[family-name:var(--font-syne)] text-lg font-bold lowercase tracking-tight">
            cagesurf 🦜
          </span>
          <span className="text-[11px] uppercase tracking-[0.16em] text-[#67707A]">
            safe browsing for older adults
          </span>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/browse/settings"
            className="text-sm font-medium text-[#878A90] underline-offset-4 transition-colors duration-200 hover:text-[#E4E2DC] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34D399]"
          >
            Settings
          </Link>
          <button
            onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } })}
            className="cursor-pointer text-sm font-medium text-[#878A90] underline-offset-4 transition-colors duration-200 hover:text-[#E4E2DC] hover:underline"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-6 pb-16 pt-8 md:px-8">
        <section className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div className="rounded-[2rem] border border-white/8 bg-[#111720] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:p-10">
            <div className="inline-flex rounded-full border border-[#34D399]/20 bg-[#34D399]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#B8F5DB]">
              Guided, safe browsing
            </div>

            <h1 className="mt-6 font-[family-name:var(--font-syne)] text-4xl font-bold leading-tight tracking-tight text-[#F2F0EA] md:text-5xl">
              How can I help you today?
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#9AA0A6] md:text-xl">
              Cage Surf helps older adults browse websites safely, explains confusing pages in simple language, and checks suspicious messages before you act.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <button
                onClick={() => createConversation.mutate({})}
                disabled={isStarting}
                className="btn-shine group cursor-pointer rounded-full bg-[#34D399] px-8 py-4 text-lg font-semibold text-[#0C0F15] transition-all duration-300 hover:bg-[#2BBD88] hover:shadow-[0_0_40px_rgba(52,211,153,0.24)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34D399]"
              >
                <span className="flex items-center gap-3">
                  {isStarting ? "Starting..." : "Start a guided session"}
                  {!isStarting && <ArrowIcon />}
                </span>
              </button>

              <div className="rounded-full border border-white/10 px-5 py-4 text-sm text-[#C8C5BD]">
                Voice or text • Step-by-step help • Built-in scam checks
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {quickActions.map((item) => (
              <div
                key={item.title}
                className="rounded-[1.5rem] border border-white/8 bg-[#141A23] p-5 shadow-[0_10px_40px_rgba(0,0,0,0.18)]"
              >
                <h2 className="text-lg font-semibold text-[#F2F0EA]">{item.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#98A0AA]">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <SafetyCheckCard />

        {conversations.length > 0 && (
          <section className="rounded-[2rem] border border-white/8 bg-[#10161E] p-6 md:p-8">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight text-[#F2F0EA]">
                  Continue where you left off
                </h2>
                <p className="mt-1 text-sm text-[#8E959E]">
                  Reopen a previous browsing session with its last page and context.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setLoadingConversationId(c.id);
                    router.push(`/browse/${c.id}`);
                  }}
                  disabled={loadingConversationId === c.id}
                  className="group cursor-pointer overflow-hidden rounded-2xl border border-white/[0.07] bg-[#151920] text-left transition-all duration-200 hover:border-[#34D399]/30 hover:shadow-[0_10px_40px_rgba(0,0,0,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34D399]"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#1C2129]">
                    {c.lastScreenshotUrl ? (
                      <Image
                        src={c.lastScreenshotUrl}
                        alt=""
                        fill
                        className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[#555860]">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="8.5" cy="10.5" r="1.5" fill="currentColor" />
                          <path d="M3 16l5-4 3 3 4-5 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                    {loadingConversationId === c.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-[#0C0F15]/70">
                        <svg className="h-6 w-6 animate-spin text-[#34D399]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" className="opacity-20" />
                          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between px-4 py-4">
                    <div>
                      <span className="block truncate text-sm font-medium text-[#E4E2DC]">
                        {c.lastVisitedUrl
                          ? c.lastVisitedUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]
                          : c.title ?? "Untitled session"}
                      </span>
                      <span className="mt-1 block text-xs text-[#666D76]">
                        Resume browsing assistance
                      </span>
                    </div>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                      className="ml-2 shrink-0 text-[#555860] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[#34D399]"
                    >
                      <path
                        d="M6 4l4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
