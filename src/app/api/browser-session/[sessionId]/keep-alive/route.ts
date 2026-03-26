import { auth } from "~/server/better-auth";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { BrowserUse } from "browser-use-sdk";

const client = new BrowserUse();

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { sessionId } = await params;

  // Verify ownership
  const conversation = await db.conversation.findFirst({
    where: { browserSessionId: sessionId, userId: session.user.id },
  });
  if (!conversation) {
    return new Response("Not found", { status: 404 });
  }

  try {
    await client.sessions.get(sessionId);
    return new Response("ok");
  } catch {
    return new Response("Session expired", { status: 410 });
  }
}
