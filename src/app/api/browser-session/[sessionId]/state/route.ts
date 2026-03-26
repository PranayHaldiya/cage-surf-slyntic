import { auth } from "~/server/better-auth";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { getSessionState } from "~/lib/ai/tool-logic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { sessionId } = await params;

  // Verify ownership via conversation
  const conversation = await db.conversation.findFirst({
    where: { browserSessionId: sessionId, userId: session.user.id },
  });
  if (!conversation) {
    return new Response("Not found", { status: 404 });
  }

  const state = await getSessionState(sessionId);
  if (!state) {
    return new Response("Session not active", { status: 410 });
  }

  return Response.json(state);
}
