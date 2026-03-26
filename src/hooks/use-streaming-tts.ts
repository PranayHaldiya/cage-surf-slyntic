import { useRef, useCallback, useMemo } from "react";

const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs "Rachel" default
const MODEL_ID = "eleven_multilingual_v2";
const PCM_SAMPLE_RATE = 24000;
// Number of chunks to buffer before starting playback (smooths network jitter)
const PRE_BUFFER_CHUNKS = 2;

function clog(tag: string, ...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][TTS:${tag}]`, ...args);
}

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
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preBufferRef = useRef<string[]>([]);
  const playbackStartedRef = useRef(false);

  const getAudioContext = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
    }
    return audioCtxRef.current;
  };

  /** Decode base64 PCM 16-bit LE into a Float32 AudioBuffer and schedule it */
  const playPcmChunk = useCallback((base64Audio: string) => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") void ctx.resume();

      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // PCM 16-bit little-endian → Float32
      const view = new DataView(bytes.buffer);
      const numSamples = bytes.length / 2;
      const audioBuffer = ctx.createBuffer(1, numSamples, PCM_SAMPLE_RATE);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < numSamples; i++) {
        channelData[i] = view.getInt16(i * 2, true) / 32768;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, nextPlayTimeRef.current);
      source.start(startTime);
      nextPlayTimeRef.current = startTime + audioBuffer.duration;
    } catch (err) {
      clog("AUDIO", "Failed to play chunk:", err);
    }
  }, []);

  /** Flush the pre-buffer and play all queued chunks */
  const flushPreBuffer = useCallback(() => {
    const chunks = preBufferRef.current;
    preBufferRef.current = [];
    playbackStartedRef.current = true;
    for (const chunk of chunks) {
      playPcmChunk(chunk);
    }
  }, [playPcmChunk]);

  const start = useCallback(async () => {
    clog("START", "Initiating streaming TTS");
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    activeRef.current = true;
    sentLengthRef.current = 0;
    nextPlayTimeRef.current = 0;
    preBufferRef.current = [];
    playbackStartedRef.current = false;

    // Get single-use token from our server
    let token: string;
    try {
      const res = await fetch("/api/speech/token", { method: "POST" });
      if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
      const data = (await res.json()) as { token: string };
      token = data.token;
    } catch (err) {
      clog("TOKEN", "Failed to get token:", err);
      activeRef.current = false;
      return;
    }

    // Open WebSocket to ElevenLabs using PCM format for gapless playback
    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream-input?model_id=${MODEL_ID}&single_use_token=${token}&output_format=pcm_24000`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      clog("WS", "Connected");
      // Send initialization message
      ws.send(
        JSON.stringify({
          text: " ",
          voice_settings: { stability: 0.5, similarity_boost: 0.8 },
          generation_config: { chunk_length_schedule: [120, 160, 250, 290] },
        }),
      );
      // Keep-alive: send a space every 15s to prevent 20s idle timeout
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      keepAliveRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          clog("WS", "Sending keep-alive");
          ws.send(JSON.stringify({ text: " ", try_trigger_generation: false }));
        }
      }, 15_000);
    };

    let chunkCount = 0;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          audio?: string;
          isFinal?: boolean;
        };
        if (data.audio) {
          chunkCount++;
          clog("WS", `Audio chunk #${chunkCount} received (${data.audio.length} chars b64)`);
          if (!playbackStartedRef.current) {
            // Buffer initial chunks to smooth out network jitter
            preBufferRef.current.push(data.audio);
            if (preBufferRef.current.length >= PRE_BUFFER_CHUNKS) {
              clog("WS", `Pre-buffer full (${PRE_BUFFER_CHUNKS} chunks), starting playback`);
              flushPreBuffer();
            }
          } else {
            playPcmChunk(data.audio);
          }
        }
        if (data.isFinal) {
          clog("WS", `Final chunk received after ${chunkCount} chunks`);
          // If we never hit the pre-buffer threshold, flush what we have
          if (!playbackStartedRef.current && preBufferRef.current.length > 0) {
            flushPreBuffer();
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = (err) => {
      clog("WS", "Error:", err);
    };

    ws.onclose = (event) => {
      clog("WS", `Closed (code=${event.code} reason="${event.reason}")`);
      if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
      // Flush any remaining pre-buffered audio on close
      if (!playbackStartedRef.current && preBufferRef.current.length > 0) {
        flushPreBuffer();
      }
      activeRef.current = false;
    };
  }, [playPcmChunk, flushPreBuffer]);

  const sendText = useCallback((fullText: string) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;

    // Only send the new portion of text
    const newText = fullText.slice(sentLengthRef.current);
    if (!newText) return;

    clog("SEND", `+${newText.length} chars (total ${fullText.length}): "${newText.slice(0, 60)}${newText.length > 60 ? "..." : ""}"`);
    sentLengthRef.current = fullText.length;
    ws.send(
      JSON.stringify({
        text: newText,
        try_trigger_generation: true,
      }),
    );
  }, []);

  const finish = useCallback(() => {
    clog("FINISH", `Flushing remaining audio (sent ${sentLengthRef.current} chars total)`);
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;

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
    if (!activeRef.current && !wsRef.current) return;
    clog("STOP", "Stopping streaming TTS");
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
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
    preBufferRef.current = [];
    playbackStartedRef.current = false;
  }, []);

  const isActive = useCallback(() => activeRef.current, []);

  return useMemo(
    () => ({ start, sendText, finish, stop, isActive }),
    [start, sendText, finish, stop, isActive],
  );
}
