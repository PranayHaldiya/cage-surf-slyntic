import { NextResponse } from "next/server";
import { getSession } from "~/server/better-auth/server";
import { env } from "~/env";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const response = await fetch("https://api.supermemory.ai/v3/documents/documents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.SUPERMEMORY_API_KEY}`,
    },
    body: JSON.stringify({
      containerTags: [session.user.id],
      page: 1,
      limit: 500,
      sort: "createdAt",
      order: "desc",
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;
  return NextResponse.json(data);
}
