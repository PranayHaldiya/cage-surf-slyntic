import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";
import { BrowseSession } from "./_components/browse-session";

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { conversationId } = await params;
  const query = await searchParams;
  const conversation = await api.conversation.get({ id: conversationId });

  return (
    <BrowseSession
      conversationId={conversation.id}
      browserSessionId={conversation.browserSessionId ?? ""}
      browserLiveUrl={conversation.browserLiveUrl}
      initialMessages={conversation.uiMessages}
      isNew={query.new === "1"}
    />
  );
}
