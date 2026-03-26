import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";
import { BrowseHome } from "./_components/browse-home";

export default async function BrowsePage() {
  const session = await getSession();
  if (!session) redirect("/");

  const conversations = await api.conversation.list();

  return <BrowseHome conversations={conversations} />;
}
