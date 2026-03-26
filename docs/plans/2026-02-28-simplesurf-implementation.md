# CageSurf Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an AI-powered browsing assistant where elderly users chat with a Claude agent that browses the web on their behalf, with structured "render screen" inputs and a live browser iframe.

**Architecture:** Single Next.js API route (`POST /api/chat`) using Vercel AI SDK `streamText`. The agent has two tools: `browse` (server-side, calls Browser Use Cloud) and `renderScreen` (client-side, no execute). The browser iframe shows Browser Use Cloud's `liveUrl`. Model is Claude via AI Gateway, wrapped with supermemory for long-term memory and Upstash Redis cache middleware.

**Tech Stack:** Next.js 15, Vercel AI SDK v5, Vercel AI Gateway, Browser Use Cloud API, Supermemory (`@supermemory/tools`), Upstash Redis (`@upstash/redis`), Prisma + PostgreSQL, Better Auth (Google OAuth), shadcn/ui, Tailwind CSS 4

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install AI SDK and related packages**

Run:
```bash
pnpm add ai @ai-sdk/react @ai-sdk/gateway @supermemory/tools @upstash/redis browser-use-sdk
```

**Step 2: Verify installation**

Run: `pnpm typecheck`
Expected: No errors (or only pre-existing ones)

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: install AI SDK, supermemory, upstash, and browser-use dependencies"
```

---

### Task 2: Add Environment Variables

**Files:**
- Modify: `src/env.js`
- Modify: `.env.example`

**Step 1: Update env schema**

In `src/env.js`, add these to the `server` object:

```js
AI_GATEWAY_API_KEY: z.string().min(1),
SUPERMEMORY_API_KEY: z.string().min(1),
KV_REST_API_URL: z.string().url(),
KV_REST_API_TOKEN: z.string().min(1),
```

Add to `runtimeEnv`:

```js
AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
SUPERMEMORY_API_KEY: process.env.SUPERMEMORY_API_KEY,
KV_REST_API_URL: process.env.KV_REST_API_URL,
KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
```

**Step 2: Update .env.example**

Add:

```
# Vercel AI Gateway
AI_GATEWAY_API_KEY=""

# Browser Use Cloud
BROWSER_USE_API_KEY=""

# Supermemory
SUPERMEMORY_API_KEY=""

# Upstash Redis (KV)
KV_REST_API_URL=""
KV_REST_API_TOKEN=""
```

**Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/env.js .env.example
git commit -m "feat: add environment variables for AI Gateway, Supermemory, and Upstash"
```

---

### Task 3: Update Database Schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add Conversation and Message models**

Add to `prisma/schema.prisma`:

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

  @@index([userId])
  @@map("conversation")
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String
  content        String       @db.Text
  createdAt      DateTime     @default(now())

  @@index([conversationId])
  @@map("message")
}
```

Add to the `User` model:

```prisma
conversations Conversation[]
```

**Step 2: Generate migration**

Run: `pnpm db:generate`
Expected: Migration created successfully

**Step 3: Verify Prisma client**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add Conversation and Message models to database schema"
```

---

### Task 4: Create Browser Use Cloud Service

**Files:**
- Create: `src/server/services/browser-use.ts`

**Step 1: Create the service module**

```typescript
import { env } from "~/env";

const BASE_URL = "https://api.browser-use.com/api/v1";

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${env.BROWSER_USE_API_KEY}`,
};

export async function createBrowserSession(opts?: {
  startUrl?: string;
}) {
  const res = await fetch(`${BASE_URL}/sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      startUrl: opts?.startUrl,
    }),
  });
  if (!res.ok) throw new Error(`Browser Use: failed to create session: ${res.statusText}`);
  return res.json() as Promise<{
    id: string;
    liveUrl: string;
    status: string;
  }>;
}

export async function deleteBrowserSession(sessionId: string) {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`Browser Use: failed to delete session: ${res.statusText}`);
}

export async function createBrowserTask(opts: {
  sessionId: string;
  task: string;
  maxSteps?: number;
}) {
  const res = await fetch(`${BASE_URL}/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      sessionId: opts.sessionId,
      task: opts.task,
      maxSteps: opts.maxSteps ?? 20,
    }),
  });
  if (!res.ok) throw new Error(`Browser Use: failed to create task: ${res.statusText}`);
  return res.json() as Promise<{ id: string; status: string }>;
}

export async function getTaskStatus(taskId: string) {
  const res = await fetch(`${BASE_URL}/tasks/${taskId}/status`, {
    method: "GET",
    headers,
  });
  if (!res.ok) throw new Error(`Browser Use: failed to get task status: ${res.statusText}`);
  return res.json() as Promise<{
    id: string;
    status: string;
    output?: string;
    finished_at?: string;
  }>;
}

export async function pollTaskUntilDone(
  taskId: string,
  intervalMs = 2000,
  timeoutMs = 120000,
): Promise<{ output: string; status: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await getTaskStatus(taskId);
    if (status.status === "finished" || status.status === "stopped") {
      return { output: status.output ?? "Task completed with no output.", status: status.status };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Browser Use: task timed out");
}

export async function pauseTask(taskId: string) {
  const res = await fetch(`${BASE_URL}/tasks/${taskId}/pause`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error(`Browser Use: failed to pause task: ${res.statusText}`);
}

export async function resumeTask(taskId: string) {
  const res = await fetch(`${BASE_URL}/tasks/${taskId}/resume`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error(`Browser Use: failed to resume task: ${res.statusText}`);
}
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/server/services/browser-use.ts
git commit -m "feat: add Browser Use Cloud service module"
```

---

### Task 5: Create Cache Middleware

**Files:**
- Create: `src/lib/ai/cache-middleware.ts`

**Step 1: Create the cache middleware**

```typescript
import { Redis } from "@upstash/redis";
import {
  type LanguageModelV3Middleware,
  type LanguageModelV1StreamPart,
  simulateReadableStream,
} from "ai";
import { env } from "~/env";

const redis = new Redis({
  url: env.KV_REST_API_URL,
  token: env.KV_REST_API_TOKEN,
});

export const cacheMiddleware: LanguageModelV3Middleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    const cacheKey = JSON.stringify(params);
    const cached = await redis.get(cacheKey);

    if (cached !== null) {
      return {
        ...(cached as any),
        response: {
          ...(cached as any).response,
          timestamp: (cached as any)?.response?.timestamp
            ? new Date((cached as any).response.timestamp as string)
            : undefined,
        },
      };
    }

    const result = await doGenerate();
    await redis.set(cacheKey, result);
    return result;
  },

  wrapStream: async ({ doStream, params }) => {
    const cacheKey = JSON.stringify(params);
    const cached = await redis.get(cacheKey);

    if (cached !== null) {
      const formattedChunks = (cached as LanguageModelV1StreamPart[]).map(
        (p) => {
          if (p.type === "response-metadata" && "timestamp" in p && p.timestamp) {
            return { ...p, timestamp: new Date(p.timestamp as string) };
          }
          return p;
        },
      );
      return {
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: 10,
          chunks: formattedChunks,
        }),
      };
    }

    const { stream, ...rest } = await doStream();
    const fullResponse: LanguageModelV1StreamPart[] = [];

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        fullResponse.push(chunk);
        controller.enqueue(chunk);
      },
      flush() {
        void redis.set(cacheKey, fullResponse);
      },
    });

    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    };
  },
};
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/ai/cache-middleware.ts
git commit -m "feat: add Upstash Redis cache middleware for AI SDK"
```

---

### Task 6: Create Chat API Route with Tools

**Files:**
- Create: `src/app/api/chat/route.ts`
- Create: `src/lib/ai/tools.ts`

**Step 1: Create tool definitions**

Create `src/lib/ai/tools.ts`:

```typescript
import { tool } from "ai";
import { z } from "zod";
import {
  createBrowserTask,
  pollTaskUntilDone,
} from "~/server/services/browser-use";

export function createBrowseTool(browserSessionId: string) {
  return tool({
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
  });
}

export const renderScreenTool = tool({
  description:
    "Show a screen to the user to collect input. Use for choices, free text input, or when the user needs to authenticate in the browser.",
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
  // No execute — handled on the client via addToolOutput
});
```

**Step 2: Create the chat API route**

Create `src/app/api/chat/route.ts`:

```typescript
import {
  type UIMessage,
  convertToModelMessages,
  streamText,
  stepCountIs,
  wrapLanguageModel,
} from "ai";
import { gateway } from "ai";
import { withSupermemory } from "@supermemory/tools/ai-sdk";
import { cacheMiddleware } from "~/lib/ai/cache-middleware";
import { createBrowseTool, renderScreenTool } from "~/lib/ai/tools";
import { env } from "~/env";
import { db } from "~/server/db";
import { auth } from "~/server/better-auth";
import { headers } from "next/headers";

export async function POST(req: Request) {
  // Authenticate
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, conversationId }: { messages: UIMessage[]; conversationId: string } =
    await req.json();

  // Get conversation and verify ownership
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, userId: session.user.id },
  });
  if (!conversation) {
    return new Response("Conversation not found", { status: 404 });
  }
  if (!conversation.browserSessionId) {
    return new Response("No browser session", { status: 400 });
  }

  // Model stack: gateway → supermemory → cache middleware
  const baseModel = gateway("anthropic/claude-sonnet-4", {
    apiKey: env.AI_GATEWAY_API_KEY,
  });
  const modelWithMemory = withSupermemory(baseModel, session.user.id, {
    apiKey: env.SUPERMEMORY_API_KEY,
  });
  const model = wrapLanguageModel({
    model: modelWithMemory,
    middleware: cacheMiddleware,
  });

  const result = streamText({
    model,
    system: `You are CageSurf, a friendly and patient browsing assistant designed for elderly users.

Your job is to help users browse the web. You have two tools:
- "browse": Use this to perform actions in the browser (navigate, click, search, fill forms, etc.)
- "renderScreen": Use this to ask the user for input when you need choices or information from them.

Guidelines:
- Use simple, clear language. Avoid jargon.
- Be patient and reassuring.
- When you find information, summarize it clearly.
- When presenting choices, use renderScreen with clear, simple options.
- For authentication (logging into websites), use renderScreen with type "auth" to prompt the user to log in directly in the browser iframe.
- Always confirm important actions before executing them.`,
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

**Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/ai/tools.ts src/app/api/chat/route.ts
git commit -m "feat: add chat API route with browse and renderScreen tools"
```

---

### Task 7: Create Conversation tRPC Router

**Files:**
- Create: `src/server/api/routers/conversation.ts`
- Modify: `src/server/api/root.ts`

**Step 1: Create the conversation router**

Create `src/server/api/routers/conversation.ts`:

```typescript
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  createBrowserSession,
  deleteBrowserSession,
} from "~/server/services/browser-use";

export const conversationRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({ title: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      // Create Browser Use Cloud session
      const browserSession = await createBrowserSession({
        startUrl: "https://www.google.com",
      });

      // Create conversation in DB
      const conversation = await ctx.db.conversation.create({
        data: {
          userId: ctx.session.user.id,
          title: input?.title ?? "New Conversation",
          browserSessionId: browserSession.id,
          browserLiveUrl: browserSession.liveUrl,
        },
      });

      return conversation;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const conversation = await ctx.db.conversation.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });
      if (!conversation) throw new Error("Conversation not found");
      return conversation;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.conversation.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const conversation = await ctx.db.conversation.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });
      if (!conversation) throw new Error("Conversation not found");

      // Clean up Browser Use session
      if (conversation.browserSessionId) {
        try {
          await deleteBrowserSession(conversation.browserSessionId);
        } catch {
          // Session may already be expired
        }
      }

      await ctx.db.conversation.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
```

**Step 2: Register in root router**

In `src/server/api/root.ts`, add:

```typescript
import { conversationRouter } from "~/server/api/routers/conversation";
```

And add to the router:

```typescript
export const appRouter = createTRPCRouter({
  post: postRouter,
  conversation: conversationRouter,
});
```

**Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/server/api/routers/conversation.ts src/server/api/root.ts
git commit -m "feat: add conversation tRPC router with Browser Use session management"
```

---

### Task 8: Create Render Screen Component

**Files:**
- Create: `src/app/_components/render-screen.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";

interface RenderScreenProps {
  type: "select-one" | "select-multi" | "text" | "auth";
  prompt: string;
  options?: string[];
  onSubmit: (value: string) => void;
}

export function RenderScreen({ type, prompt, options, onSubmit }: RenderScreenProps) {
  const [textValue, setTextValue] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  if (type === "select-one") {
    return (
      <div className="flex flex-col items-center gap-6 p-8">
        <h2 className="text-center text-2xl font-semibold">{prompt}</h2>
        <div className="flex w-full max-w-lg flex-col gap-3">
          {options?.map((option) => (
            <button
              key={option}
              onClick={() => onSubmit(option)}
              className="rounded-xl border-2 border-primary/20 bg-card px-6 py-4 text-left text-lg font-medium transition-colors hover:border-primary hover:bg-primary/5 active:bg-primary/10"
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (type === "select-multi") {
    return (
      <div className="flex flex-col items-center gap-6 p-8">
        <h2 className="text-center text-2xl font-semibold">{prompt}</h2>
        <div className="flex w-full max-w-lg flex-col gap-3">
          {options?.map((option) => {
            const isSelected = selectedOptions.includes(option);
            return (
              <button
                key={option}
                onClick={() =>
                  setSelectedOptions((prev) =>
                    isSelected
                      ? prev.filter((o) => o !== option)
                      : [...prev, option],
                  )
                }
                className={`rounded-xl border-2 px-6 py-4 text-left text-lg font-medium transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-primary/20 bg-card hover:border-primary/40"
                }`}
              >
                <span className="mr-3 inline-block h-5 w-5 rounded border-2 border-current align-middle">
                  {isSelected && <span className="block h-full w-full rounded-sm bg-primary" />}
                </span>
                {option}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => onSubmit(selectedOptions.join(", "))}
          disabled={selectedOptions.length === 0}
          className="rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          Submit
        </button>
      </div>
    );
  }

  if (type === "text") {
    return (
      <div className="flex flex-col items-center gap-6 p-8">
        <h2 className="text-center text-2xl font-semibold">{prompt}</h2>
        <textarea
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          placeholder="Type your answer here..."
          className="w-full max-w-lg rounded-xl border-2 border-primary/20 bg-card p-4 text-lg focus:border-primary focus:outline-none"
          rows={4}
        />
        <button
          onClick={() => onSubmit(textValue)}
          disabled={!textValue.trim()}
          className="rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          Submit
        </button>
      </div>
    );
  }

  if (type === "auth") {
    return (
      <div className="flex flex-col items-center gap-6 p-8">
        <h2 className="text-center text-2xl font-semibold">{prompt}</h2>
        <p className="max-w-md text-center text-lg text-muted-foreground">
          Please log in using the browser on the left side of the screen. When
          you are done, click the button below.
        </p>
        <button
          onClick={() => onSubmit("User completed authentication")}
          className="rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground"
        >
          I&apos;m Done Logging In
        </button>
      </div>
    );
  }

  return null;
}
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/_components/render-screen.tsx
git commit -m "feat: add RenderScreen component for structured user input"
```

---

### Task 9: Create Chat Panel Component

**Files:**
- Create: `src/app/_components/chat-panel.tsx`

**Step 1: Create the chat panel**

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useState } from "react";
import { RenderScreen } from "./render-screen";

interface ChatPanelProps {
  conversationId: string;
  onRenderScreen: (screen: {
    type: "select-one" | "select-multi" | "text" | "auth";
    prompt: string;
    options?: string[];
    toolCallId: string;
  } | null) => void;
}

export function ChatPanel({ conversationId, onRenderScreen }: ChatPanelProps) {
  const [input, setInput] = useState("");

  const { messages, sendMessage, addToolOutput, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { conversationId },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const isLoading = status === "streaming" || status === "submitted";

  return (
    <div className="flex h-full flex-col">
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

                if (part.type === "tool-renderScreen") {
                  if (part.state === "input-available") {
                    // Notify parent to show render screen in main area
                    onRenderScreen({
                      type: part.input.type,
                      prompt: part.input.prompt,
                      options: part.input.options,
                      toolCallId: part.toolCallId,
                    });
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
                    onRenderScreen(null);
                    return (
                      <div
                        key={`${message.id}-${i}`}
                        className="mr-auto max-w-[80%] rounded-2xl bg-accent px-4 py-3 text-lg"
                      >
                        You answered: {part.output as string}
                      </div>
                    );
                  }
                }

                return null;
              })}
            </div>
          ))}

          {isLoading && (
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
          if (!input.trim()) return;
          sendMessage({ text: input });
          setInput("");
        }}
        className="border-t p-4"
      >
        <div className="flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-xl border-2 border-input bg-background px-4 py-3 text-lg focus:border-primary focus:outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-primary px-6 py-3 text-lg font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
```

Note: The `onRenderScreen` callback is used to lift the active render screen state up to the browse page, so it can be displayed in the main content area (overlaying the browser iframe). The `addToolOutput` function is available from `useChat` and will be used by the `RenderScreen` component via the parent page.

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/_components/chat-panel.tsx
git commit -m "feat: add ChatPanel component with useChat and tool handling"
```

---

### Task 10: Create Browse Page

**Files:**
- Create: `src/app/browse/page.tsx`
- Create: `src/app/browse/[conversationId]/page.tsx`

**Step 1: Create the conversation list page**

Create `src/app/browse/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";
import { BrowseHome } from "./_components/browse-home";

export default async function BrowsePage() {
  const session = await getSession();
  if (!session) redirect("/");

  const conversations = await api.conversation.list();

  return <BrowseHome conversations={conversations} />;
}
```

Create `src/app/browse/_components/browse-home.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

interface Conversation {
  id: string;
  title: string | null;
  createdAt: Date;
}

export function BrowseHome({ conversations }: { conversations: Conversation[] }) {
  const router = useRouter();
  const createConversation = api.conversation.create.useMutation({
    onSuccess: (data) => {
      router.push(`/browse/${data.id}`);
    },
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold">CageSurf</h1>
      <p className="max-w-md text-center text-xl text-muted-foreground">
        Your friendly browsing assistant. Start a new conversation to browse the
        web with help.
      </p>

      <button
        onClick={() => createConversation.mutate({})}
        disabled={createConversation.isPending}
        className="rounded-xl bg-primary px-8 py-4 text-xl font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
      >
        {createConversation.isPending ? "Starting..." : "Start Browsing"}
      </button>

      {conversations.length > 0 && (
        <div className="mt-8 w-full max-w-md">
          <h2 className="mb-4 text-xl font-semibold">Recent Conversations</h2>
          <div className="flex flex-col gap-2">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/browse/${c.id}`)}
                className="rounded-xl border-2 border-border bg-card px-4 py-3 text-left text-lg transition-colors hover:border-primary/40"
              >
                {c.title ?? "Untitled"}
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
```

**Step 2: Create the conversation page**

Create `src/app/browse/[conversationId]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { api } from "~/trpc/server";
import { BrowseSession } from "./_components/browse-session";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { conversationId } = await params;
  const conversation = await api.conversation.get({ id: conversationId });

  return (
    <BrowseSession
      conversationId={conversation.id}
      browserLiveUrl={conversation.browserLiveUrl}
    />
  );
}
```

Create `src/app/browse/[conversationId]/_components/browse-session.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { RenderScreen } from "~/app/_components/render-screen";

interface ActiveScreen {
  type: "select-one" | "select-multi" | "text" | "auth";
  prompt: string;
  options?: string[];
  toolCallId: string;
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

  const { messages, sendMessage, addToolOutput, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { conversationId },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Check messages for active renderScreen tool calls
  const checkForRenderScreen = useCallback(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          part.type === "tool-renderScreen" &&
          part.state === "input-available"
        ) {
          setActiveScreen({
            type: part.input.type,
            prompt: part.input.prompt,
            options: part.input.options,
            toolCallId: part.toolCallId,
          });
          return;
        }
      }
    }
    setActiveScreen(null);
  }, [messages]);

  // Re-check whenever messages change
  // (useCallback + dependency on messages handles this)
  useState(() => {
    checkForRenderScreen();
  });

  const handleRenderScreenSubmit = (value: string) => {
    if (!activeScreen) return;
    addToolOutput({
      tool: "renderScreen",
      toolCallId: activeScreen.toolCallId,
      output: value,
    });
    setActiveScreen(null);
  };

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
        {activeScreen && (
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

                  if (part.type === "tool-renderScreen") {
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
                          {part.output as string}
                        </div>
                      );
                    }
                  }

                  return null;
                })}
              </div>
            ))}

            {isLoading && (
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
            if (!input.trim()) return;
            sendMessage({ text: input });
            setInput("");
          }}
          className="border-t p-4"
        >
          <div className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What would you like to do?"
              className="flex-1 rounded-xl border-2 border-input bg-background px-4 py-3 text-lg focus:border-primary focus:outline-none"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="rounded-xl bg-primary px-6 py-3 text-lg font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/browse/
git commit -m "feat: add browse page with browser iframe and chat panel"
```

---

### Task 11: Update Homepage

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Update the homepage**

Replace `src/app/page.tsx` with a simple landing page that directs authenticated users to `/browse`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "~/server/better-auth";
import { getSession } from "~/server/better-auth/server";

export default async function Home() {
  const session = await getSession();

  if (session) {
    redirect("/browse");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-5xl font-bold">CageSurf</h1>
      <p className="max-w-md text-center text-xl text-muted-foreground">
        A friendly browsing assistant that helps you navigate the web with ease.
      </p>
      <form>
        <button
          className="rounded-xl bg-primary px-8 py-4 text-xl font-semibold text-primary-foreground"
          formAction={async () => {
            "use server";
            const res = await auth.api.signInSocial({
              body: {
                provider: "google",
                callbackURL: "/browse",
              },
            });
            if (!res.url) {
              throw new Error("No URL returned from signInSocial");
            }
            redirect(res.url);
          }}
        >
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
```

**Step 2: Update layout metadata**

In `src/app/layout.tsx`, update the metadata:

```typescript
export const metadata: Metadata = {
  title: "CageSurf",
  description: "A friendly browsing assistant for the web",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};
```

**Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/page.tsx src/app/layout.tsx
git commit -m "feat: update homepage with CageSurf landing page"
```

---

### Task 12: TypeScript and Lint Verification

**Files:** None (verification only)

**Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS with no errors

**Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS with no errors (or only pre-existing warnings)

**Step 3: Fix any issues found**

Address any TypeScript or lint errors from the previous tasks.

**Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve TypeScript and lint errors"
```

---

## File Summary

| Action | Path |
|--------|------|
| Modify | `package.json` |
| Modify | `src/env.js` |
| Modify | `.env.example` |
| Modify | `prisma/schema.prisma` |
| Modify | `src/server/api/root.ts` |
| Modify | `src/app/page.tsx` |
| Modify | `src/app/layout.tsx` |
| Create | `src/server/services/browser-use.ts` |
| Create | `src/lib/ai/cache-middleware.ts` |
| Create | `src/lib/ai/tools.ts` |
| Create | `src/app/api/chat/route.ts` |
| Create | `src/server/api/routers/conversation.ts` |
| Create | `src/app/_components/render-screen.tsx` |
| Create | `src/app/browse/page.tsx` |
| Create | `src/app/browse/_components/browse-home.tsx` |
| Create | `src/app/browse/[conversationId]/page.tsx` |
| Create | `src/app/browse/[conversationId]/_components/browse-session.tsx` |

## Environment Variables Required

```
AI_GATEWAY_API_KEY=
BROWSER_USE_API_KEY=
SUPERMEMORY_API_KEY=
KV_REST_API_URL=
KV_REST_API_TOKEN=
DATABASE_URL=
BETTER_AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```
