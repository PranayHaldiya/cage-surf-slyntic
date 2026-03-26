import {
  experimental_generateSpeech as generateSpeech,
  experimental_transcribe as transcribe,
} from "ai";
import { elevenlabs } from "@ai-sdk/elevenlabs";
import { auth } from "~/server/better-auth";
import { headers } from "next/headers";

const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_LENGTH = 5000; // characters

export async function POST(req: Request) {
  // Authenticate
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await req.json()) as {
    action: "transcribe" | "speak";
    audio?: string;
    text?: string;
  };

  if (body.action === "transcribe") {
    if (!body.audio || typeof body.audio !== "string") {
      return Response.json({ error: "Missing audio" }, { status: 400 });
    }

    // Check size (base64 is ~4/3 of original)
    const estimatedBytes = (body.audio.length * 3) / 4;
    if (estimatedBytes > MAX_AUDIO_SIZE) {
      return Response.json({ error: "Audio too large" }, { status: 413 });
    }

    const audioBuffer = Buffer.from(body.audio, "base64");
    const result = await transcribe({
      model: elevenlabs.transcription("scribe_v1"),
      audio: audioBuffer,
      providerOptions: {
        elevenlabs: { languageCode: "en" },
      },
    });

    return Response.json({ text: result.text });
  }

  if (body.action === "speak") {
    if (!body.text || typeof body.text !== "string") {
      return Response.json({ error: "Missing text" }, { status: 400 });
    }

    if (body.text.length > MAX_TEXT_LENGTH) {
      return Response.json({ error: "Text too long" }, { status: 413 });
    }

    const result = await generateSpeech({
      model: elevenlabs.speech("eleven_multilingual_v2"),
      text: body.text,
    });

    return Response.json({
      audio: result.audio.base64,
      mediaType: result.audio.mediaType,
    });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
