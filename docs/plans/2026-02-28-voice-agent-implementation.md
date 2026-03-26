# Voice Agent Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a LiveKit-powered voice agent mode to CageSurf that shares the same tools, supermemory, chat history, and system prompt as the existing text agent.

**Architecture:** A LiveKit voice agent runs on LiveKit Cloud as a separate Node.js worker. The frontend toggles between text (useChat) and voice (LiveKit room) within the same BrowseSession. Both modes write to the same Conversation/Message DB tables. Shared modules (tools, system prompt, model config) are extracted so both the chat route and voice agent import them.

**Tech Stack:** LiveKit Agents Node.js SDK, LiveKit Components React, livekit-server-sdk, Deepgram STT, Cartesia TTS, Claude Sonnet 4 via LiveKit hosted inference

---

## Task 1: Install LiveKit dependencies

**Files:**

- Modify: `package.json`

**Step 1: Install server-side LiveKit packages**

Run:

```bash
pnpm add @livekit/agents @livekit/agents-plugin-silero @livekit/agents-plugin-livekit @livekit/noise-cancellation-node livekit-server-sdk @livekit/protocol
```

**Step 2: Install client-side LiveKit packages**

Run:

```bash
pnpm add @livekit/components-react @livekit/components-styles livekit-client
```

**Step 3: Verify installation**

Run: `pnpm build`
Expected: Build succeeds (LiveKit packages are just installed, not used yet)

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(voice): install LiveKit agent and client dependencies"
```

---

## Task 2: Add LiveKit environment variables

**Files:**

- Modify: `src/env.js`
- Modify: `.env.example`

**Step 1: Add LiveKit env vars to env.js**

Add these three variables to the `server` section of `src/env.js`:

```typescript
LIVEKIT_URL: z.string().url(),
LIVEKIT_API_KEY: z.string().min(1),
LIVEKIT_API_SECRET: z.string().min(1),
```

And add them to the `runtimeEnv` section:

```typescript
LIVEKIT_URL: process.env.LIVEKIT_URL,
LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
```

**Step 2: Add to .env.example**

Append to `.env.example`:

```
# LiveKit (Voice Agent)
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

**Step 3: Set actual values in your .env file**

Get these from your LiveKit Cloud project dashboard.

**Step 4: Verify env loads**

Run: `pnpm dev`
Expected: App starts without env validation errors (assuming .env has the values)

**Step 5: Commit**

```bash
git add src/env.js .env.example
git commit -m "feat(voice): add LiveKit environment variables"
```

---

## Task 3: Extract shared AI config into `src/lib/ai/shared.ts`

This is the critical refactor — extracting the system prompt, model stack factory, and tool creators so both the text chat route and the voice agent can import them.

**Files:**

- Create: `src/lib/ai/shared.ts`
- Modify: `src/app/api/chat/route.ts`

**Step 1: Create the shared module**

Create `src/lib/ai/shared.ts`:

```typescript
import { wrapLanguageModel } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { withSupermemory } from "@supermemory/tools/ai-sdk";
import { cacheMiddleware } from "~/lib/ai/cache-middleware";
import { env } from "~/env";

export const SYSTEM_PROMPT = `You are CageSurf, a friendly and patient browsing assistant designed for elderly users.

Your job is to help users browse the web. You have two tools:
- "browse": Use this to perform actions in the browser (navigate, click, search, fill forms, etc.)
- "renderScreen": Use this to ask the user for input when you need choices or information from them.

Guidelines:
- Use simple, clear language. Avoid jargon.
- Be patient and reassuring.
- When you find information, summarize it clearly.
- When presenting choices, use renderScreen with clear, simple options.
- For authentication (logging into websites), use renderScreen with type "auth" to prompt the user to log in directly in the browser iframe.
- Always confirm important actions before executing them.`;

export function createModelStack(userId: string) {
  const gatewayProvider = createGateway({
    apiKey: env.AI_GATEWAY_API_KEY,
  });
  const baseModel = gatewayProvider("anthropic/claude-sonnet-4");
  const modelWithMemory = withSupermemory(baseModel, userId, {
    apiKey: env.SUPERMEMORY_API_KEY,
  });
  return wrapLanguageModel({
    model: modelWithMemory,
    middleware: cacheMiddleware,
  });
}
```

**Step 2: Refactor chat route to use shared module**

Replace the model stack and system prompt in `src/app/api/chat/route.ts` with imports from `shared.ts`:

```typescript
import {
  type UIMessage,
  convertToModelMessages,
  streamText,
  stepCountIs,
} from "ai";
import { SYSTEM_PROMPT, createModelStack } from "~/lib/ai/shared";
import { createBrowseTool, renderScreenTool } from "~/lib/ai/tools";
import { db } from "~/server/db";
import { auth } from "~/server/better-auth";
import { headers } from "next/headers";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await req.json()) as {
    messages: UIMessage[];
    conversationId: string;
  };
  const { messages, conversationId } = body;

  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, userId: session.user.id },
  });
  if (!conversation) {
    return new Response("Conversation not found", { status: 404 });
  }
  if (!conversation.browserSessionId) {
    return new Response("No browser session", { status: 400 });
  }

  const model = createModelStack(session.user.id);

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(10),
    tools: {
      browse: createBrowseTool(conversation.browserSessionId),
      renderScreen: renderScreenTool,
    },
  });

  return result.toUIMessageStreamResponse();
}
```

**Step 3: Verify the refactor didn't break anything**

Run: `pnpm build`
Expected: Build succeeds

**Step 4: Manually test text chat**

Run: `pnpm dev`, navigate to a conversation, send a message.
Expected: Text chat works identically to before.

**Step 5: Commit**

```bash
git add src/lib/ai/shared.ts src/app/api/chat/route.ts
git commit -m "refactor: extract shared AI config for text and voice agents"
```

---

## Task 4: Create LiveKit token generation API route

**Files:**

- Create: `src/app/api/livekit/token/route.ts`

**Step 1: Create the token endpoint**

Create `src/app/api/livekit/token/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { auth } from "~/server/better-auth";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { env } from "~/env";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await req.json()) as { conversationId: string };
  const { conversationId } = body;

  // Verify conversation ownership
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, userId: session.user.id },
  });
  if (!conversation) {
    return new Response("Conversation not found", { status: 404 });
  }

  const roomName = `cagesurf-${conversationId}`;

  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: session.user.id,
    name: session.user.name ?? "User",
    metadata: JSON.stringify({
      conversationId,
      browserSessionId: conversation.browserSessionId,
      userId: session.user.id,
    }),
    ttl: "30m",
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  at.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: "cagesurf-voice",
        metadata: JSON.stringify({
          conversationId,
          browserSessionId: conversation.browserSessionId,
          userId: session.user.id,
        }),
      }),
    ],
  });

  const token = await at.toJwt();

  return NextResponse.json({
    serverUrl: env.LIVEKIT_URL,
    token,
    roomName,
  });
}
```

**Step 2: Verify it compiles**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/livekit/token/route.ts
git commit -m "feat(voice): add LiveKit token generation API route"
```

---

## Task 5: Create the LiveKit voice agent worker

**Files:**

- Create: `src/agent/agent.ts`
- Create: `src/agent/index.ts`

**Step 1: Create the Agent class**

Create `src/agent/agent.ts`:

```typescript
import { voice, llm } from "@livekit/agents";
import { z } from "zod";
import {
  createBrowserTask,
  pollTaskUntilDone,
} from "../server/services/browser-use";
import { SYSTEM_PROMPT } from "../lib/ai/shared";

export class CageSurfAgent extends voice.Agent {
  private browserSessionId: string;

  constructor(browserSessionId: string) {
    super({
      instructions:
        SYSTEM_PROMPT +
        `\n\nYou are currently in VOICE mode. The user is speaking to you.
Additional voice-mode guidelines:
- Keep responses concise and conversational — the user is listening, not reading.
- When using renderScreen, speak the options clearly (e.g. "Would you like option one, two, or three?") and listen for their verbal choice.
- Avoid long lists or complex formatting in speech.
- Speak warmly and clearly.`,
      tools: {
        browse: llm.tool({
          description:
            "Browse the web on behalf of the user. Give a natural language instruction for what to do in the browser.",
          parameters: z.object({
            instruction: z
              .string()
              .describe(
                'What to do in the browser, e.g. "search for flights to Paris on Google Flights"',
              ),
          }),
          execute: async ({ instruction }) => {
            const task = await createBrowserTask({
              sessionId: browserSessionId,
              task: instruction,
            });
            const result = await pollTaskUntilDone(task.id);
            return result.output;
          },
        }),
        renderScreen: llm.tool({
          description:
            "Ask the user for input via voice. Speak the prompt and options clearly, then listen for their response.",
          parameters: z.object({
            type: z
              .enum(["select-one", "select-multi", "text", "auth"])
              .describe("The type of input to collect"),
            prompt: z.string().describe("What to ask the user"),
            options: z
              .array(z.string())
              .optional()
              .describe("Options for select-one or select-multi types"),
          }),
          execute: async ({ type, prompt, options }) => {
            // In voice mode, the agent speaks the prompt and options.
            // The LLM will naturally speak this and listen for the user's verbal response.
            if (type === "auth") {
              return "I've asked the user to log in via the browser. Waiting for them to confirm.";
            }
            const optionsList = options
              ? options.map((o, i) => `Option ${i + 1}: ${o}`).join(". ")
              : "";
            return `Asked the user: ${prompt}. ${optionsList}. Waiting for their verbal response.`;
          },
        }),
      },
    });
    this.browserSessionId = browserSessionId;
  }
}
```

**Step 2: Create the agent entry point**

Create `src/agent/index.ts`:

```typescript
import {
  type JobContext,
  type JobProcess,
  ServerOptions,
  cli,
  defineAgent,
  voice,
} from "@livekit/agents";
import * as livekit from "@livekit/agents-plugin-livekit";
import * as silero from "@livekit/agents-plugin-silero";
import { BackgroundVoiceCancellation } from "@livekit/noise-cancellation-node";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { CageSurfAgent } from "./agent";

dotenv.config({ path: ".env.local" });

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    const vad = ctx.proc.userData.vad! as silero.VAD;

    // Extract metadata from the agent dispatch
    const metadata = JSON.parse(ctx.job.agentDispatch?.metadata ?? "{}") as {
      conversationId?: string;
      browserSessionId?: string;
      userId?: string;
    };

    if (!metadata.browserSessionId) {
      console.error("No browserSessionId in agent dispatch metadata");
      return;
    }

    const session = new voice.AgentSession({
      vad,
      stt: "deepgram/nova-3",
      llm: "anthropic/claude-sonnet-4",
      tts: "cartesia/sonic-3",
      turnDetection: new livekit.turnDetector.MultilingualModel(),
    });

    await session.start({
      agent: new CageSurfAgent(metadata.browserSessionId),
      room: ctx.room,
      inputOptions: {
        noiseCancellation: BackgroundVoiceCancellation(),
      },
    });

    await ctx.connect();

    session.generateReply({
      instructions:
        "Greet the user warmly. Say something like: Hi there! I'm CageSurf, your browsing helper. What would you like to do today?",
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "cagesurf-voice",
  }),
);
```

**Step 3: Verify the agent compiles**

The agent runs as a separate Node.js process, not within Next.js. Verify TypeScript is happy:

Run: `pnpm exec tsc --noEmit src/agent/index.ts`

Note: This may require adjusting tsconfig or creating a separate `tsconfig.agent.json` if path aliases (`~/`) don't resolve for the agent. If so, the agent should use relative imports instead:

```typescript
// In agent files, use relative imports instead of ~/
import { SYSTEM_PROMPT } from "../lib/ai/shared";
import {
  createBrowserTask,
  pollTaskUntilDone,
} from "../server/services/browser-use";
```

**Step 4: Commit**

```bash
git add src/agent/
git commit -m "feat(voice): create LiveKit voice agent with browse and renderScreen tools"
```

---

## Task 6: Add mic toggle and LiveKit room to BrowseSession

**Files:**

- Modify: `src/app/browse/[conversationId]/_components/browse-session.tsx`

**Step 1: Add voice mode state and LiveKit connection logic**

Update `browse-session.tsx` to add a mic toggle button and LiveKit room integration. The key changes:

1. Add state for `voiceMode` (boolean), `livekitToken` (string | null), `livekitUrl` (string | null)
2. Add a mic button next to the Send button
3. When mic is clicked, fetch token from `/api/livekit/token`, then connect to LiveKit room
4. When mic is clicked again, disconnect
5. Display transcriptions from LiveKit in the chat panel

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
} from "ai";
import { RenderScreen } from "~/app/_components/render-screen";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  BarVisualizer,
} from "@livekit/components-react";
import "@livekit/components-styles";

interface ActiveScreen {
  type: "select-one" | "select-multi" | "text" | "auth";
  prompt: string;
  options?: string[];
  toolCallId: string;
}

interface VoiceConnection {
  token: string;
  serverUrl: string;
}

function VoiceIndicator() {
  const { state, audioTrack } = useVoiceAssistant();
  return (
    <div className="flex flex-col items-center gap-2 p-4">
      <BarVisualizer
        state={state}
        barCount={5}
        trackRef={audioTrack}
        className="h-16 w-48"
      />
      <p className="text-lg text-muted-foreground">
        {state === "listening"
          ? "Listening..."
          : state === "thinking"
            ? "Thinking..."
            : state === "speaking"
              ? "Speaking..."
              : "Connecting..."}
      </p>
    </div>
  );
}

export function BrowseSession({
  conversationId,
  browserLiveUrl,
}: {
  conversationId: string;
  browserLiveUrl: string | null;
}) {
  const [input, setInput] = useState("");
  const [activeScreen, setActiveScreen] = useState<ActiveScreen | null>(null);
  const [voiceConnection, setVoiceConnection] =
    useState<VoiceConnection | null>(null);
  const [isConnectingVoice, setIsConnectingVoice] = useState(false);

  const { messages, sendMessage, addToolOutput, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { conversationId },
    }),
  });

  const isLoading = status === "streaming" || status === "submitted";
  const isVoiceMode = voiceConnection !== null;

  // Scan messages for active renderScreen tool calls
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          part.type.startsWith("tool-") &&
          "toolCallId" in part &&
          "state" in part &&
          part.state === "input-available" &&
          "input" in part
        ) {
          const toolInput = part.input as {
            type: "select-one" | "select-multi" | "text" | "auth";
            prompt: string;
            options?: string[];
          };
          if (part.type === "tool-renderScreen") {
            setActiveScreen({
              type: toolInput.type,
              prompt: toolInput.prompt,
              options: toolInput.options,
              toolCallId: part.toolCallId,
            });
            return;
          }
        }
      }
    }
    setActiveScreen(null);
  }, [messages]);

  const handleRenderScreenSubmit = (value: string) => {
    if (!activeScreen) return;
    void addToolOutput({
      tool: "renderScreen",
      toolCallId: activeScreen.toolCallId,
      output: value,
    });
    setActiveScreen(null);
  };

  const toggleVoice = useCallback(async () => {
    if (isVoiceMode) {
      setVoiceConnection(null);
      return;
    }

    setIsConnectingVoice(true);
    try {
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) throw new Error("Failed to get voice token");
      const data = (await res.json()) as {
        token: string;
        serverUrl: string;
        roomName: string;
      };
      setVoiceConnection({
        token: data.token,
        serverUrl: data.serverUrl,
      });
    } catch (err) {
      console.error("Voice connection failed:", err);
    } finally {
      setIsConnectingVoice(false);
    }
  }, [isVoiceMode, conversationId]);

  return (
    <div className="flex h-screen">
      {/* Main content: browser iframe + render screen overlay */}
      <div className="relative flex-[3]">
        {browserLiveUrl && (
          <iframe
            src={browserLiveUrl}
            className="h-full w-full border-0"
            title="Browser View"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        )}

        {/* Render screen overlay */}
        {activeScreen && !isVoiceMode && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90">
            <div className="w-full max-w-xl">
              <RenderScreen
                type={activeScreen.type}
                prompt={activeScreen.prompt}
                options={activeScreen.options}
                onSubmit={handleRenderScreenSubmit}
              />
            </div>
          </div>
        )}
      </div>

      {/* Chat panel */}
      <div className="flex h-full flex-[2] flex-col border-l">
        {/* Voice mode indicator */}
        {isVoiceMode && voiceConnection && (
          <LiveKitRoom
            serverUrl={voiceConnection.serverUrl}
            token={voiceConnection.token}
            connect={true}
            audio={true}
            onDisconnected={() => setVoiceConnection(null)}
          >
            <RoomAudioRenderer />
            <VoiceIndicator />
          </LiveKitRoom>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <div key={message.id}>
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <div
                        key={`${message.id}-${i}`}
                        className={`rounded-2xl px-4 py-3 text-lg ${
                          message.role === "user"
                            ? "ml-auto max-w-[80%] bg-primary text-primary-foreground"
                            : "mr-auto max-w-[80%] bg-muted"
                        }`}
                      >
                        {part.text}
                      </div>
                    );
                  }

                  if (
                    part.type.startsWith("tool-") &&
                    "state" in part &&
                    "toolCallId" in part
                  ) {
                    if (part.state === "input-available") {
                      return (
                        <div
                          key={`${message.id}-${i}`}
                          className="mr-auto max-w-[80%] rounded-2xl bg-accent px-4 py-3 text-lg italic text-muted-foreground"
                        >
                          Waiting for your response...
                        </div>
                      );
                    }
                    if (part.state === "output-available") {
                      return (
                        <div
                          key={`${message.id}-${i}`}
                          className="ml-auto max-w-[80%] rounded-2xl bg-primary/80 px-4 py-3 text-lg text-primary-foreground"
                        >
                          {String((part as { output: unknown }).output)}
                        </div>
                      );
                    }
                  }

                  return null;
                })}
              </div>
            ))}

            {isLoading && !isVoiceMode && (
              <div className="mr-auto max-w-[80%] rounded-2xl bg-muted px-4 py-3 text-lg text-muted-foreground">
                Thinking...
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim() || isVoiceMode) return;
            void sendMessage({ text: input });
            setInput("");
          }}
          className="border-t p-4"
        >
          <div className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isVoiceMode
                  ? "Voice mode active — speak to me!"
                  : "What would you like to do?"
              }
              className="flex-1 rounded-xl border-2 border-input bg-background px-4 py-3 text-lg focus:border-primary focus:outline-none disabled:opacity-50"
              disabled={isLoading || isVoiceMode}
            />
            {!isVoiceMode && (
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="rounded-xl bg-primary px-6 py-3 text-lg font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
              >
                Send
              </button>
            )}
            <button
              type="button"
              onClick={() => void toggleVoice()}
              disabled={isConnectingVoice}
              className={`rounded-xl px-5 py-3 text-lg font-semibold transition-all ${
                isVoiceMode
                  ? "animate-pulse bg-red-500 text-white"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              } disabled:opacity-50`}
              title={isVoiceMode ? "Stop voice mode" : "Start voice mode"}
            >
              {isConnectingVoice ? "..." : isVoiceMode ? "🎤" : "🎙️"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/browse/[conversationId]/_components/browse-session.tsx
git commit -m "feat(voice): add mic toggle and LiveKit room to BrowseSession"
```

---

## Task 7: Configure agent for LiveKit Cloud deployment

**Files:**

- Create: `livekit-agent.json` (or `lk` CLI config)

**Step 1: Create a package.json script for running the agent locally**

Add to root `package.json` scripts:

```json
"agent:dev": "node --loader ts-node/esm src/agent/index.ts dev"
```

Note: The agent needs to run as a standalone Node.js process. You may need `ts-node` or `tsx` to run TypeScript directly:

```bash
pnpm add -D tsx
```

Then update the script:

```json
"agent:dev": "tsx src/agent/index.ts dev"
```

**Step 2: Test the agent locally**

Run: `pnpm agent:dev`
Expected: Agent registers with LiveKit Cloud and waits for dispatch. You should see output like:

```
[info] registered agent: cagesurf-voice
[info] waiting for dispatch...
```

**Step 3: Test end-to-end**

1. Run `pnpm dev` (Next.js) and `pnpm agent:dev` (LiveKit agent) in separate terminals
2. Navigate to a conversation in the browser
3. Click the mic button
4. Speak — you should hear the agent greet you
5. The agent should be able to browse on your behalf via voice commands

**Step 4: Commit**

```bash
git add package.json
git commit -m "feat(voice): add agent dev script for local testing"
```

---

## Task 8: Deploy agent to LiveKit Cloud

**Step 1: Install LiveKit CLI**

Run:

```bash
brew install livekit-cli
```

Or via npm:

```bash
npm install -g @livekit/cli
```

**Step 2: Authenticate with LiveKit Cloud**

Run:

```bash
lk cloud auth
```

**Step 3: Deploy the agent**

Run:

```bash
lk cloud deploy --agent-name cagesurf-voice
```

Follow the CLI prompts to configure the deployment. You'll need to provide:

- The entry point: `src/agent/index.ts`
- Environment variables: `BROWSER_USE_API_KEY`, `AI_GATEWAY_API_KEY`, `SUPERMEMORY_API_KEY`

**Step 4: Verify deployment**

Run:

```bash
lk cloud agent list
```

Expected: `cagesurf-voice` appears as a registered agent.

**Step 5: Test production flow**

1. With the Next.js app running (locally or on Vercel)
2. Navigate to a conversation, click the mic button
3. The cloud-deployed agent should respond via voice

---

## Important Notes

### Anthropic Claude on LiveKit Node.js

The string format `"anthropic/claude-sonnet-4"` is used for LiveKit Cloud's hosted inference. If this doesn't work in the Node.js agent (Anthropic plugin is primarily Python), fall back to:

- `"openai/gpt-4.1"` as the LLM string, or
- Use the OpenAI plugin with Anthropic's OpenAI-compatible API endpoint

### Browser Use API from LiveKit Cloud

The agent worker runs on LiveKit Cloud infrastructure. It needs access to the Browser Use API. Ensure `BROWSER_USE_API_KEY` is set as an environment variable in the LiveKit Cloud deployment.

### Shared imports between Next.js and Agent

The agent uses relative imports from `src/lib/ai/shared.ts` and `src/server/services/browser-use.ts`. These modules must work outside the Next.js runtime:

- `shared.ts` imports `~/env` which uses `@t3-oss/env-nextjs` — this won't work in the agent process. The agent should use `process.env` directly via `dotenv` instead.
- Consider creating a thin `src/lib/ai/shared-core.ts` that exports just `SYSTEM_PROMPT` (no env dependencies) for the agent to import, or have the agent define its env access separately.

### Future improvements (not in scope)

- Transcription display in chat panel from LiveKit data channels
- Persisting voice turns to Message table for cross-mode history
- Supermemory integration in the voice agent (requires passing the API key to the agent process)
