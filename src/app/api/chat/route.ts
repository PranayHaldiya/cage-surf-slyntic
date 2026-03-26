import {
  type UIMessage,
  convertToModelMessages,
  streamText,
  stepCountIs,
  wrapLanguageModel,
} from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { withSupermemory } from "@supermemory/tools/ai-sdk";
import { cacheMiddleware } from "~/lib/ai/cache-middleware";
import {
  createBrowseTool,
  renderScreenTool,
  webSearchTool,
  createRecordTaskTool,
} from "~/lib/ai/tools";
import {
  buildSystemPrompt,
  emptySessionMemory,
  type SessionMemory,
} from "~/lib/ai/orchestration";
import { env } from "~/env";
import { db } from "~/server/db";
import { auth } from "~/server/better-auth";
import { headers } from "next/headers";
import {
  isBrowserSessionAlive,
  createBrowserSession,
} from "~/server/services/browser-use";

function log(tag: string, ...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][CHAT:${tag}]`, ...args);
}

export async function POST(req: Request) {
  log("REQUEST", "POST /api/chat received");

  // Authenticate
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    log("AUTH", "Unauthorized — no session");
    return new Response("Unauthorized", { status: 401 });
  }
  log("AUTH", "User:", session.user.id);

  const body = (await req.json()) as {
    messages: UIMessage[];
    conversationId: string;
  };
  const { messages, conversationId } = body;

  log("INPUT", "conversationId:", conversationId, "messages:", messages.length);
  // Log each message summary
  for (const msg of messages) {
    const parts = msg.parts.map((p) => {
      if (p.type === "text")
        return `text:"${(p as { text: string }).text.slice(0, 80)}"`;
      if (p.type.startsWith("tool-")) {
        const state = "state" in p ? (p as { state: string }).state : "?";
        return `${p.type}(${state})`;
      }
      return p.type;
    });
    log("INPUT:msg", `[${msg.role}] id=${msg.id} parts=[${parts.join(", ")}]`);
  }

  // read location from cookie
  const cookieHeader = (await headers()).get("cookie") ?? "";
  const locationCookie = /user_location=([^;]+)/.exec(cookieHeader)?.[1];
  const location = (() => {
    if (!locationCookie) return undefined;
    const [latStr, lngStr, ...nameParts] = locationCookie.split(",");
    const lat = latStr ? parseFloat(latStr) : NaN;
    const lng = lngStr ? parseFloat(lngStr) : NaN;
    const name = nameParts.join(",") || null;
    return {
      lat: isNaN(lat) ? null : lat,
      lng: isNaN(lng) ? null : lng,
      name,
    };
  })();
  log(
    "LOCATION",
    location ? `${location.lat},${location.lng} (${location.name})` : "none",
  );

  // Get conversation and verify ownership
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, userId: session.user.id },
  });
  if (!conversation) {
    log("DB", "Conversation not found:", conversationId);
    return new Response("Conversation not found", { status: 404 });
  }
  if (!conversation.browserSessionId) {
    log("DB", "No browser session for conversation:", conversationId);
    return new Response("No browser session", { status: 400 });
  }
  log(
    "DB",
    "Conversation found, browserSessionId:",
    conversation.browserSessionId,
  );

  // re-create browser session if it expired
  let browserSessionId = conversation.browserSessionId;
  const alive = await isBrowserSessionAlive(browserSessionId);
  log("BROWSER", "Session alive:", alive);
  if (!alive) {
    log("BROWSER", "Recreating session, lastUrl:", conversation.lastVisitedUrl);
    const newSession = await createBrowserSession(
      conversation.lastVisitedUrl ?? undefined,
    );
    browserSessionId = newSession.id;
    log("BROWSER", "New session:", browserSessionId);
    await db.conversation.update({
      where: { id: conversationId },
      data: {
        browserSessionId: newSession.id,
        browserLiveUrl: newSession.liveUrl,
      },
    });
  }

  // auto-title from first user message if untitled
  if (!conversation.title) {
    const firstUserMessage = messages.find((m) => m.role === "user");
    if (firstUserMessage) {
      const text = firstUserMessage.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ")
        .slice(0, 100);
      if (text) {
        log("TITLE", "Auto-titling:", text);
        await db.conversation.update({
          where: { id: conversationId },
          data: { title: text },
        });
      }
    }
  }

  // Load session memory from DB
  const sessionMemory: SessionMemory = conversation.sessionMemory
    ? (conversation.sessionMemory as unknown as SessionMemory)
    : emptySessionMemory();
  log("MEMORY", "Loaded session memory:", JSON.stringify(sessionMemory));

  const saveSessionMemory = async (memory: SessionMemory) => {
    log("MEMORY", "Saving session memory:", JSON.stringify(memory));
    await db.conversation.update({
      where: { id: conversationId },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: { sessionMemory: JSON.parse(JSON.stringify(memory)) },
    });
  };

  // Build system prompt using shared orchestration
  const systemPrompt = buildSystemPrompt({
    mode: "text",
    location,
    memory: sessionMemory,
  });
  log("PROMPT", "System prompt length:", systemPrompt.length);

  // Model stack: gateway -> supermemory -> cache middleware
  const gatewayProvider = createGateway({
    apiKey: env.AI_GATEWAY_API_KEY,
  });
  const baseModel = gatewayProvider("google/gemini-3-flash");
  const modelWithMemory = withSupermemory(baseModel, session.user.id, {
    apiKey: env.SUPERMEMORY_API_KEY,
    addMemory: "always",
  });
  const model = wrapLanguageModel({
    model: modelWithMemory,
    middleware: cacheMiddleware,
  });

  log(
    "STREAM",
    "Starting streamText with tools: browse, webSearch, renderScreen, recordTask",
  );
  // Fix up broken tool-call parts so the chat NEVER breaks:
  // - Strip parts with no valid input (streaming, errored, malformed)
  // - Auto-answer unanswered/errored parts with "No answer"
  for (const m of messages) {
    for (let i = 0; i < m.parts.length; i++) {
      const p = m.parts[i]!;
      if (!("state" in p && "toolCallId" in p)) continue;

      const hasValidInput = "input" in p && p.input != null && typeof p.input === "object";

      // Strip any part without valid input — can't send to API
      if (!hasValidInput) {
        log("SANITIZE", `Stripped tool part (no valid input): ${p.type} state=${p.state}`);
        m.parts.splice(i, 1);
        i--;
        continue;
      }

      // Strip parts still streaming (incomplete tool calls from interrupted streams)
      if (p.state === "input-streaming") {
        log("SANITIZE", `Stripped incomplete streaming tool part: ${p.type}`);
        m.parts.splice(i, 1);
        i--;
        continue;
      }

      // Auto-answer unanswered or errored tool calls with "No answer"
      if (p.state === "output-error" || p.state === "input-available") {
        log("SANITIZE", `Auto-answered abandoned tool part: ${p.type} state=${p.state}`);
        Object.assign(p, { state: "output-available", output: "No answer", errorText: undefined });
      }
    }
  }
  const modelMessages = await convertToModelMessages(messages);
  log("STREAM", "Converted to", modelMessages.length, "model messages");

  const result = streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    stopWhen: stepCountIs(100),
    tools: {
      browse: createBrowseTool(
        browserSessionId,
        conversationId,
        sessionMemory,
        saveSessionMemory,
      ),
      webSearch: webSearchTool,
      renderScreen: renderScreenTool,
      recordTask: createRecordTaskTool(sessionMemory, saveSessionMemory),
    },
  });

  log("STREAM", "Returning stream response");
  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages: updatedMessages }) => {
      log("FINISH", "Stream finished, total messages:", updatedMessages.length);
      // Log each output message
      for (const msg of updatedMessages) {
        const parts = msg.parts.map((p) => {
          if (p.type === "text")
            return `text:"${(p as { text: string }).text.slice(0, 80)}"`;
          if (p.type.startsWith("tool-")) {
            const state = "state" in p ? (p as { state: string }).state : "?";
            return `${p.type}(${state})`;
          }
          return p.type;
        });
        log(
          "FINISH:msg",
          `[${msg.role}] id=${msg.id} parts=[${parts.join(", ")}]`,
        );
      }

      // persist all messages to db — filter out empty/broken messages
      const validMessages = updatedMessages.filter(
        (m) => m.id && m.parts.length > 0,
      );
      log("DB", "Deleting old messages for conversation:", conversationId);
      log(
        "DB",
        `Filtered: ${updatedMessages.length} total → ${validMessages.length} valid`,
      );

      // Use a transaction so delete + create are atomic
      if (validMessages.length > 0) {
        await db.$transaction([
          db.message.deleteMany({ where: { conversationId } }),
          db.message.createMany({
            data: validMessages.map((m) => ({
              id: m.id,
              conversationId,
              role: m.role,
              content: JSON.stringify(m),
            })),
          }),
        ]);
        log("DB", "Saved", validMessages.length, "messages in transaction");
      } else {
        log("DB", "No valid messages to save, skipping");
      }

      // Auto-record renderScreen QA into session memory
      let qaRecorded = 0;
      for (const msg of updatedMessages) {
        for (const part of msg.parts) {
          if (
            part.type === "tool-renderScreen" &&
            "state" in part &&
            part.state === "output-available" &&
            "input" in part &&
            "output" in part
          ) {
            const input = part.input as { prompt: string };
            const output = part.output as string;
            const alreadyRecorded = sessionMemory.screenQA.some(
              (qa) => qa.question === input.prompt && qa.answer === output,
            );
            if (!alreadyRecorded) {
              sessionMemory.screenQA.push({
                question: input.prompt,
                answer: output,
              });
              qaRecorded++;
            }
          }
        }
      }
      if (qaRecorded > 0) {
        log("MEMORY", "Auto-recorded", qaRecorded, "renderScreen QA pairs");
      }
      await saveSessionMemory(sessionMemory);
      log("FINISH", "All done");
    },
  });
}
