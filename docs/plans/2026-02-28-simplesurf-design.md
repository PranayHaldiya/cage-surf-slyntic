# CageSurf Design Document

**Date:** 2026-02-28

## Overview

CageSurf is an AI-powered browsing assistant for elderly users. Users communicate with a Claude-powered agent through a text chat interface. The agent browses the web on their behalf using Browser Use Cloud and collects structured input through "render screens."

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (Client)                    │
│                                                          │
│  ┌──────────────────────────┐  ┌──────────────────────┐ │
│  │     Main Content (60%)    │  │   Chat Panel (40%)   │ │
│  │                           │  │                      │ │
│  │  Browser Use liveUrl      │  │  Message list         │ │
│  │  iframe (always visible)  │  │  (useChat hook)      │ │
│  │                           │  │                      │ │
│  │  Render Screen            │  │  Text input           │ │
│  │  (overlays when active)   │  │                      │ │
│  └──────────────────────────┘  └──────────────────────┘ │
└──────────────────┬──────────────────────────────────────┘
                   │ useChat (stream)
                   ▼
┌──────────────────────────────────────────────────────────┐
│              POST /api/chat (Next.js Route)              │
│                                                          │
│  streamText({                                            │
│    model: supermemory(gateway('anthropic/claude-...'))    │
│    tools: { browse, renderScreen }                       │
│    stopWhen: stepCountIs(10)                             │
│  })                                                      │
└──────┬───────────────────────────┬──────────────────────┘
       │                           │
       ▼                           ▼
┌──────────────┐         ┌──────────────────┐
│ Browser Use  │         │  renderScreen    │
│ Cloud API    │         │  (client-side    │
│              │         │   tool — no      │
│ POST /tasks  │         │   execute fn)    │
│ GET /status  │         └──────────────────┘
└──────────────┘
```

### Agent-as-Orchestrator Pattern

The Vercel AI SDK agent orchestrates everything. Browser Use Cloud and render screen are tools the agent calls. The agent decides when to browse and when to ask the user for input.

**Flow example:** User says "Book me a flight" → Agent calls `browse("search flights on Google Flights")` → Gets results → Calls `renderScreen({ type: "select-one", prompt: "Which flight?", options: [...] })` → User picks → Agent calls `browse("click on flight option 2")` → etc.

## Tools

### `browse` (server-side tool)

Calls Browser Use Cloud API to perform browser actions within the conversation's session.

- **Input:** `instruction` (string) — natural language instruction for the browser agent
- **Execution:** Creates a Browser Use Cloud task within the session, polls until complete, returns result text
- **Output:** Text result from the browser agent

### `renderScreen` (client-side tool, no execute function)

Shows structured UI to collect user input. Handled on the frontend via the AI SDK's `addToolOutput` mechanism.

- **Input:**
  - `type`: `select-one` | `select-multi` | `text` | `auth`
  - `prompt`: string — what to ask the user
  - `options`: string[] (optional) — for select types
- **No execute function** — forwarded to the client

### Render Screen Types

| Type | UI | User Action |
|------|-----|------------|
| `select-one` | Large buttons/cards with options, prompt at top | Click one → sent as tool output |
| `select-multi` | Checkboxes with options, prompt at top, Submit button | Check + submit → sent as tool output |
| `text` | Prompt at top, large text input, Submit button | Type + submit → sent as tool output |
| `auth` | Message to log in in browser, Done button, iframe visible | Click Done → sent as tool output |

## Data Model

```prisma
model Conversation {
  id               String    @id @default(cuid())
  userId           String
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  title            String?
  browserSessionId String?
  browserLiveUrl   String?
  messages         Message[]
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String
  content        String
  createdAt      DateTime     @default(now())
}
```

### Browser Session Lifecycle

1. User creates a new conversation → API creates a Browser Use Cloud session → stores `sessionId` + `liveUrl`
2. Each agent `browse` call creates a task within that session (persistent cookies/auth)
3. User ends conversation or timeout → API deletes the Browser Use session

## API Route

Single route: `POST /api/chat`

**Model stack:** Vercel AI Gateway (`anthropic/claude-sonnet-4`) → Supermemory wrapper (per-user long-term memory) → Cache middleware (Upstash Redis)

**Configuration:**
- `streamText` with `stopWhen: stepCountIs(10)` for multi-step tool chains
- `convertToModelMessages` to convert `UIMessage[]` to model format
- Returns `result.toUIMessageStreamResponse()`
- Messages saved to PostgreSQL asynchronously

## Frontend

### Page Layout (`/browse`)

- **Left 60%:** Browser Use `liveUrl` in an iframe. When a render screen is active, it overlays on top.
- **Right 40%:** Chat panel with message list and text input.

### Chat Integration

- `useChat` hook from `@ai-sdk/react`
- `sendMessage` for sending user messages
- `addToolOutput` for responding to render screen tool calls
- `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` for auto-continuing after tool outputs
- Tool parts rendered inline: `tool-renderScreen` with states `input-streaming` → `input-available` → `output-available`

### Design Principles (Elderly Users)

- Large text (18px+ base), high contrast
- Big click targets (48px+ touch targets)
- Simple language in prompts
- Clear visual feedback during loading
- No tiny buttons or complex interactions

## External Services

| Service | Env Var | Purpose |
|---------|---------|---------|
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` | LLM access (Claude) |
| Browser Use Cloud | `BROWSER_USE_API_KEY` | Browser automation |
| Supermemory | `SUPERMEMORY_API_KEY` | Long-term user memory |
| Upstash Redis | `KV_URL`, `KV_TOKEN` | Cache middleware |
| PostgreSQL | `DATABASE_URL` | Chat history & conversations |
| Better Auth | `BETTER_AUTH_SECRET` | Session management |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login |

## Authentication

Existing Google OAuth via Better Auth. Users must log in to use the app. Conversations are tied to authenticated users.
