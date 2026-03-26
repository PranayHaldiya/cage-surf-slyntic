# Streaming TTS Design

**Date:** 2026-03-01
**Status:** Approved

## Problem

Currently, TTS only fires after the entire AI response is complete. In voice mode, this means long silences while the AI streams text + executes tools, then a single burst of audio at the end. We want the AI to "speak as it thinks" for a more natural conversational experience.

## Approach: ElevenLabs WebSocket Streaming

Open an ElevenLabs WebSocket connection when the AI starts streaming a voice-mode response. Pipe text deltas into the WebSocket as tokens arrive. ElevenLabs returns audio chunks, which we play immediately via Web Audio API.

```
User speaks → STT → AI streams text tokens
                         ↓
                    Text deltas piped to ElevenLabs WebSocket
                         ↓
                    Audio chunks received back
                         ↓
                    Queued & played via Web Audio API
```

## API Key Security

Use ElevenLabs single-use tokens to avoid exposing the API key to the client:

1. Server endpoint `POST /api/speech/token` calls `POST https://api.elevenlabs.io/v1/single-use-token/tts_websocket` with the server-side API key
2. Returns the token to the client
3. Client connects directly to ElevenLabs WebSocket using the token
4. Token expires after 15 minutes, consumed on use

## New Files

### `/api/speech/token/route.ts`
Server endpoint that fetches a single-use `tts_websocket` token from ElevenLabs.

### `src/hooks/use-streaming-tts.ts`
Custom React hook managing:
- WebSocket lifecycle (open, send, close)
- Audio chunk decoding and queued playback via Web Audio API
- Interruption handling (stop playback + close WS when user speaks again)

## Modified Files

### `browse-session.tsx`
Replace the current "wait until status=ready, then call playTTS for full text" logic with the new streaming hook:
- When `sentViaMicRef` is true and status becomes `streaming`, activate the hook
- Hook watches text deltas and pipes them to the WebSocket
- When user starts speaking again, hook interrupts playback

## Audio Playback Strategy

Use Web Audio API (AudioContext) for gapless chunk playback:
- Decode each incoming base64 audio chunk into an AudioBuffer
- Schedule buffers sequentially using `AudioBufferSourceNode.start(nextPlayTime)`
- Eliminates gaps between chunks

## Text Chunking Strategy

Use ElevenLabs' built-in buffering rather than manual sentence detection:
- Send text as it arrives from the AI stream
- Set `try_trigger_generation: true` on each send
- Use `chunk_length_schedule: [50, 120, 160, 250]` for natural audio generation timing
- Send `flush: true` when AI streaming ends to generate audio for remaining text

## Interruption Handling

When user clicks mic to speak again mid-response:
1. Close WebSocket connection
2. Stop all scheduled audio buffers
3. Clear the audio queue

## Scope

- Voice mode only (when `sentViaMicRef` is true)
- Manual "read aloud" button keeps using the existing batch `/api/speech` endpoint
- No changes to STT flow
