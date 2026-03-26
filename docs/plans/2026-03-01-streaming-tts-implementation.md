# Streaming TTS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI voice speak incrementally as text streams in, instead of waiting until the full response is complete.

**Architecture:** Client opens an ElevenLabs WebSocket connection (authenticated via a single-use token from our server) when the AI starts streaming a voice-mode response. Text deltas are piped into the WebSocket as they arrive. Audio chunks come back and are played immediately via Web Audio API for gapless playback.

**Tech Stack:** ElevenLabs WebSocket TTS API, Web Audio API, Next.js API routes, React hooks

---

### Task 1: Create the single-use token API endpoint

**Files:**
- Create: `src/app/api/speech/token/route.ts`

**Step 1: Create the token endpoint**

```typescript
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
    return new Response("Failed to get token", { status: 502 });
  }

  const data = (await res.json()) as { token: string };
  return Response.json({ token: data.token });
}
```

**Step 2: Verify it works**

Run: `pnpm dev`
Test manually: `curl -X POST http://localhost:3000/api/speech/token` (should return 401 without auth)

**Step 3: Commit**

```bash
git add src/app/api/speech/token/route.ts
git commit -m "feat: add ElevenLabs single-use token endpoint for streaming TTS"
```

---

### Task 2: Create the useStreamingTTS hook

**Files:**
- Create: `src/hooks/use-streaming-tts.ts`

**Step 1: Write the hook**

This hook manages the full lifecycle: token fetch → WebSocket open → text streaming → audio decode → gapless playback → cleanup.

```typescript
import { useRef, useCallback } from "react";

const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs "Rachel" default
const MODEL_ID = "eleven_multilingual_v2";

interface StreamingTTSControls {
  /** Call when AI streaming starts and voice mode is active */
  start: () => Promise<void>;
  /** Call with new text content as it arrives from the AI stream */
  sendText: (text: string) => void;
  /** Call when AI streaming finishes to flush remaining audio */
  finish: () => void;
  /** Call to immediately stop playback and close connection */
  stop: () => void;
  /** Whether TTS is currently active */
  isActive: () => boolean;
}

export function useStreamingTTS(): StreamingTTSControls {
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const activeRef = useRef(false);
  const sentLengthRef = useRef(0);

  const getAudioContext = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };

  const playAudioChunk = async (base64Audio: string) => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") await ctx.resume();

      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const audioBuffer = await ctx.decodeAudioData(bytes.buffer as ArrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, nextPlayTimeRef.current);
      source.start(startTime);
      nextPlayTimeRef.current = startTime + audioBuffer.duration;
    } catch (err) {
      console.warn("[StreamingTTS] Failed to play audio chunk:", err);
    }
  };

  const start = useCallback(async () => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    activeRef.current = true;
    sentLengthRef.current = 0;
    nextPlayTimeRef.current = 0;

    // Get single-use token from our server
    let token: string;
    try {
      const res = await fetch("/api/speech/token", { method: "POST" });
      if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
      const data = (await res.json()) as { token: string };
      token = data.token;
    } catch (err) {
      console.error("[StreamingTTS] Failed to get token:", err);
      activeRef.current = false;
      return;
    }

    // Open WebSocket to ElevenLabs
    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream-input?model_id=${MODEL_ID}&single_use_token=${token}&output_format=mp3_44100_128`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[StreamingTTS] WebSocket connected");
      // Send initialization message
      ws.send(
        JSON.stringify({
          text: " ",
          voice_settings: { stability: 0.5, similarity_boost: 0.8 },
          generation_config: { chunk_length_schedule: [50, 120, 160, 250] },
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          audio?: string;
          isFinal?: boolean;
        };
        if (data.audio) {
          void playAudioChunk(data.audio);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = (err) => {
      console.error("[StreamingTTS] WebSocket error:", err);
    };

    ws.onclose = () => {
      console.log("[StreamingTTS] WebSocket closed");
      activeRef.current = false;
    };
  }, []);

  const sendText = useCallback((fullText: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Only send the new portion of text
    const newText = fullText.slice(sentLengthRef.current);
    if (!newText) return;

    sentLengthRef.current = fullText.length;
    ws.send(
      JSON.stringify({
        text: newText,
        try_trigger_generation: true,
      }),
    );
  }, []);

  const finish = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Send flush to generate audio for any remaining buffered text
    ws.send(JSON.stringify({ text: "", flush: true }));

    // Close after a short delay to allow final audio chunks
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ text: "" }));
        ws.close();
      }
    }, 5000);
  }, []);

  const stop = useCallback(() => {
    // Close WebSocket
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ text: "" }));
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop all scheduled audio
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    activeRef.current = false;
    sentLengthRef.current = 0;
    nextPlayTimeRef.current = 0;
  }, []);

  const isActive = useCallback(() => activeRef.current, []);

  return { start, sendText, finish, stop, isActive };
}
```

**Step 2: Verify no type errors**

Run: `pnpm typecheck`

**Step 3: Commit**

```bash
git add src/hooks/use-streaming-tts.ts
git commit -m "feat: add useStreamingTTS hook with WebSocket + Web Audio playback"
```

---

### Task 3: Integrate the hook into browse-session.tsx

**Files:**
- Modify: `src/app/browse/[conversationId]/_components/browse-session.tsx`

**Step 1: Add the import and hook instantiation**

At the top of `browse-session.tsx`, add the import:

```typescript
import { useStreamingTTS } from "~/hooks/use-streaming-tts";
```

Inside the `BrowseSession` component (after line 175, after `sentViaMicRef`), add:

```typescript
const streamingTTS = useStreamingTTS();
```

**Step 2: Add effect to start streaming TTS when voice-mode AI response begins**

Replace the existing TTS auto-play effect (lines 271-292) with two new effects:

```typescript
// Start streaming TTS when AI begins responding to a voice message
const ttsStartedRef = useRef(false);
useEffect(() => {
  const isStreaming = status === "streaming" || status === "submitted";

  // Start TTS when streaming begins and we're in voice mode
  if (isStreaming && sentViaMicRef.current && !ttsStartedRef.current) {
    ttsStartedRef.current = true;
    void streamingTTS.start();
  }

  // When streaming ends, flush remaining audio and reset
  if (status === "ready" && ttsStartedRef.current) {
    ttsStartedRef.current = false;
    sentViaMicRef.current = false;
    streamingTTS.finish();
  }
}, [status, streamingTTS]);

// Pipe text deltas to the streaming TTS as they arrive
useEffect(() => {
  if (!streamingTTS.isActive()) return;

  // Find the latest assistant message and extract its text
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return;

  const textParts = lastAssistant.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");

  if (textParts.trim()) {
    streamingTTS.sendText(textParts);
  }
}, [messages, streamingTTS]);
```

**Step 3: Stop TTS when user starts recording again**

In the `startRecording` function (around line 376), add a call to stop streaming TTS at the very beginning of the function:

```typescript
const startRecording = async () => {
  // Stop any active streaming TTS
  streamingTTS.stop();

  try {
    // ... existing code
```

**Step 4: Verify no type errors**

Run: `pnpm typecheck`

**Step 5: Commit**

```bash
git add src/app/browse/[conversationId]/_components/browse-session.tsx
git commit -m "feat: integrate streaming TTS into voice mode responses"
```

---

### Task 4: Manual testing and polish

**Step 1: Test the full voice flow**

1. Run `pnpm dev`
2. Start a conversation
3. Hold the mic button and speak a question
4. Verify:
   - Audio starts playing within ~1 second of the first text appearing
   - Audio continues as more text streams in
   - No gaps or overlapping audio
   - Audio finishes cleanly after the AI is done

**Step 2: Test interruption**

1. While the AI is speaking, press the mic button again
2. Verify: Audio stops immediately, recording begins

**Step 3: Test the "read aloud" button still works**

1. Type a message (don't use mic)
2. Click the speaker icon on the response
3. Verify: The existing batch TTS still works via `/api/speech`

**Step 4: Fix any issues found during testing, then commit**

```bash
git add -A
git commit -m "fix: polish streaming TTS based on manual testing"
```

---

### Task 5: Handle edge cases

**Files:**
- Modify: `src/hooks/use-streaming-tts.ts`
- Modify: `src/app/browse/[conversationId]/_components/browse-session.tsx`

**Step 1: Handle WebSocket connection failure gracefully**

If the WebSocket fails to connect, fall back to the existing batch TTS behavior. In `browse-session.tsx`, add a fallback in the status-ready effect:

```typescript
// When streaming ends, flush remaining audio and reset
if (status === "ready" && ttsStartedRef.current) {
  ttsStartedRef.current = false;
  const wasMic = sentViaMicRef.current;
  sentViaMicRef.current = false;

  if (streamingTTS.isActive()) {
    // Streaming TTS worked, just flush
    streamingTTS.finish();
  } else if (wasMic) {
    // Streaming TTS failed to connect, fall back to batch TTS
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant) {
      const textParts = lastAssistant.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ");
      if (textParts.trim()) void playTTS(textParts);
    }
  }
}
```

**Step 2: Add cleanup on unmount**

In `browse-session.tsx`, add a cleanup effect:

```typescript
useEffect(() => {
  return () => {
    streamingTTS.stop();
  };
}, [streamingTTS]);
```

**Step 3: Verify and commit**

Run: `pnpm typecheck`

```bash
git add src/hooks/use-streaming-tts.ts src/app/browse/[conversationId]/_components/browse-session.tsx
git commit -m "feat: add fallback to batch TTS and cleanup on unmount"
```
