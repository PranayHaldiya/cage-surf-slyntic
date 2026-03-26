import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";

export default async function NewBrowsePage() {
  const session = await getSession();
  if (!session) redirect("/");

  const conversations = await api.conversation.list();
  if (conversations.length > 0) redirect("/browse");

  const conversation = await api.conversation.create({});
  redirect(`/browse/${conversation.id}?new=1`);
}
