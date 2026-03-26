import { auth } from "~/server/better-auth";
import { headers } from "next/headers";
import { env } from "~/env";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const res = await fetch(
    "https://api.elevenlabs.io/v1/single-use-token/tts_websocket",
    {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    },
  );

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    console.error(`[speech/token] ElevenLabs returned ${res.status}: ${errorBody}`);
    return new Response("Failed to get token", { status: 502 });
  }

  const data = (await res.json()) as { token: string };
  return Response.json({ token: data.token });
}
