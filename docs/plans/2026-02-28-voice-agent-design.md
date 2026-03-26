# Voice Agent Mode — Design Document

## Overview

Add a voice agent mode to CageSurf that lets elderly users interact with the browsing assistant through natural speech. The voice agent uses the same tools, supermemory, chat history, and system prompt as the existing text agent. Users toggle between text and voice within the same conversation.

## Architecture

```
                    ┌─────────────────────────────┐
                    │   BrowseSession Component    │
                    │                              │
                    │  ┌─────────┐  ┌───────────┐  │
                    │  │ useChat  │  │ LiveKit   │  │
                    │  │ (text)   │  │ Room      │  │
                    │  │          │  │ (voice)   │  │
                    │  └────┬────┘  └─────┬─────┘  │
                    └───────┼─────────────┼────────┘
                            │             │
                   POST /api/chat    WebRTC Audio
                            │             │
                    ┌───────┴───┐   ┌─────┴──────────┐
                    │ Next.js   │   │ LiveKit Cloud   │
                    │ API Route │   │ Agent Worker    │
                    │           │   │                 │
                    │ streamText│   │ STT → Claude →  │
                    │ + tools   │   │ TTS + tools     │
                    └───────────┘   └─────────────────┘
                            │             │
                     ┌──────┴─────────────┴──────┐
                     │   Shared modules:          │
                     │   - tools (browse,         │
                     │     renderScreen)           │
                     │   - browser-use service     │
                     │   - supermemory config      │
                     │   - system prompt           │
                     └────────────────────────────┘
```

### Key decisions

- Text and voice modes are **mutually exclusive** — mic toggle switches between them.
- Both modes write to the same Conversation + Message tables in PostgreSQL.
- The LiveKit agent is a **separate Node.js entry point** (`src/agent/index.ts`) deployed to LiveKit Cloud.
- Tool definitions and services live in shared modules both the chat route and agent import.
- `renderScreen` in voice mode: the agent speaks the prompt aloud and listens for verbal answers (no visual overlay).

## LiveKit Agent Worker

The agent runs on LiveKit Cloud as a separate Node.js process.

### Voice pipeline

- **STT:** Deepgram (best accuracy for elderly speech — slower, clearer patterns)
- **LLM:** Claude Sonnet 4 via AI Gateway (same model as text mode)
- **TTS:** Cartesia Sonic or ElevenLabs (natural, warm voice for elderly UX)
- **VAD:** Silero (voice activity detection for turn-taking)

### Tool handling

- `browse`: Works identically to text mode — calls Browser Use Cloud, returns result, agent speaks the summary.
- `renderScreen`: Voice-only adaptation. Agent speaks the prompt (e.g., "Would you like option A, option B, or option C?") and parses the user's verbal response.

### Chat history sync

- On session start, the agent loads existing conversation messages from the DB.
- Each voice turn (user transcript + agent response) is written to the Message table.
- When user switches back to text mode, `useChat` sees the full history.

### Supermemory

The agent wraps the Claude model with `withSupermemory` using the same user ID and API key — identical to the text route.

## Frontend Integration

### Mic toggle

- Microphone button appears next to the text input in BrowseSession.
- Clicking connects to a LiveKit room via `@livekit/components-react`.
- Text input is disabled while voice mode is active.
- Visual indicator: pulsing mic icon + "Listening..." state.

### Token generation flow

1. User clicks mic → frontend calls `POST /api/livekit/token` with `conversationId`.
2. Server creates a LiveKit room (named after the conversation), generates access token with agent dispatch, returns it.
3. Frontend connects using `LiveKitRoom` component.
4. LiveKit Cloud dispatches the agent worker to join the room.

### Transcription display

- LiveKit provides real-time transcription events via data channels.
- User speech transcripts appear in the chat panel as user messages (same styling).
- Agent speech transcripts appear as assistant messages.
- Real-time display as speech occurs.

### Disconnection

- Clicking mic again disconnects from the LiveKit room.
- Text input re-enabled.
- Conversation continues seamlessly in text mode.

## New Files

| File | Purpose |
|------|---------|
| `src/agent/index.ts` | LiveKit agent worker entry point |
| `src/agent/agent.ts` | Voice Agent class (extends `voice.Agent`) |
| `src/app/api/livekit/token/route.ts` | Token generation + room creation API |
| `src/lib/ai/shared.ts` | Extracted shared config: system prompt, model stack factory, tool creators |

## Refactored Files

| File | Change |
|------|--------|
| `src/app/api/chat/route.ts` | Imports model stack + tools from `shared.ts` |
| `src/app/browse/[conversationId]/_components/browse-session.tsx` | Add mic toggle, LiveKit room connection, transcription display |

## Dependencies

### New packages

- `@livekit/agents` — Agent framework
- `@livekit/agents-plugin-silero` — VAD
- `@livekit/agents-plugin-openai` (or provider-specific STT/TTS plugins)
- `livekit-server-sdk` — Token generation
- `@livekit/components-react` — Frontend room components
- `livekit-client` — Frontend SDK

### New environment variables

- `LIVEKIT_URL` — LiveKit Cloud WebSocket URL
- `LIVEKIT_API_KEY` — LiveKit API key
- `LIVEKIT_API_SECRET` — LiveKit API secret

## Deployment

- Agent worker deployed to LiveKit Cloud via `lk cloud deploy`.
- Next.js app stays on Vercel unchanged.
