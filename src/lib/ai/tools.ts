import { tool } from "ai";
import { z } from "zod";
import { executeWebSearch, executeBrowseTask } from "./tool-logic";
import { db } from "~/server/db";
import { env } from "~/env";
import type { SessionMemory } from "./orchestration";

function log(tag: string, ...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][TOOL:${tag}]`, ...args);
}

// extract the first url from a string
function extractUrl(text: string): string | null {
  const match = /https?:\/\/[^\s)"',]+/i.exec(text);
  return match?.[0] ?? null;
}

// Track the active browse task ID per conversation so we can cancel on new browse
const activeBrowseTasks = new Map<string, string>();

export function createBrowseTool(
  browserSessionId: string,
  conversationId: string,
  _sessionMemory: SessionMemory,
  _saveSessionMemory: (memory: SessionMemory) => Promise<void>,
) {
  return tool({
    description:
      "Browse the web on behalf of the user. Give a natural language instruction for what to do in the browser.",
    inputSchema: z.object({
      instruction: z
        .string()
        .describe(
          'What to do in the browser, e.g. "search for flights to Paris on Google Flights"',
        ),
    }),
    execute: async ({ instruction }) => {
      const t0 = Date.now();
      log("browse", "▶ Called:", instruction);
      const previousTaskId = activeBrowseTasks.get(conversationId) ?? null;
      if (previousTaskId) {
        log("browse", "Cancelling previous task:", previousTaskId);
      }

      try {
        const result = await executeBrowseTask(
          browserSessionId,
          instruction,
          previousTaskId,
        );
        log("browse", "✓ Done:", result.output.slice(0, 200), `(${Date.now() - t0}ms)`);

        activeBrowseTasks.set(conversationId, result.taskId);

        // update lastVisitedUrl and screenshot from output or instruction
        const url = extractUrl(result.output) ?? extractUrl(instruction);
        if (url || result.screenshotUrl) {
          log("browse", "Updating DB — url:", url, "screenshot:", !!result.screenshotUrl);
          await db.conversation.update({
            where: { id: conversationId },
            data: {
              ...(url && { lastVisitedUrl: url }),
              ...(result.screenshotUrl && {
                lastScreenshotUrl: result.screenshotUrl,
              }),
            },
          });
        }

        return result.output;
      } catch (err) {
        log("browse", "✗ ERROR:", err);
        return "Sorry, I ran into a problem trying to do that in the browser. Could you try again?";
      }
    },
  });
}

export const webSearchTool = tool({
  description:
    "Search the web for quick answers and background context. Use this for factual questions, looking up information, or gathering context before browsing. Returns relevant results with titles, URLs, and highlights.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
  }),
  execute: async ({ query }) => {
    const t0 = Date.now();
    log("webSearch", "▶ Called:", query);
    try {
      const results = await executeWebSearch(query, env.EXA_API_KEY);
      log("webSearch", "✓ Done:", results.length, "results", `(${Date.now() - t0}ms)`);
      return JSON.stringify(results);
    } catch (err) {
      log("webSearch", "✗ ERROR:", err);
      return "Search failed.";
    }
  },
});

export const renderScreenTool = tool({
  description:
    "Show a screen to the user to collect input. Use for choices, free text input, or when the user needs to authenticate in the browser.",
  inputSchema: z.object({
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

export function createRecordTaskTool(
  sessionMemory: SessionMemory,
  saveSessionMemory: (memory: SessionMemory) => Promise<void>,
) {
  return tool({
    description:
      "Record a task you completed, so you remember your progress. Use this after completing a significant action like navigating to a page, filling a form, or finding information.",
    inputSchema: z.object({
      instruction: z
        .string()
        .describe("What you were asked to do or decided to do"),
      outcome: z
        .string()
        .describe("What happened — the result of the action"),
    }),
    execute: async ({ instruction, outcome }) => {
      log("recordTask", "▶ Called:", instruction, "→", outcome);
      sessionMemory.completedTasks.push({
        instruction,
        outcome: outcome.slice(0, 150),
      });
      await saveSessionMemory(sessionMemory);
      log("recordTask", "✓ Saved to session memory");
      return `Recorded: ${instruction} → ${outcome}`;
    },
  });
}
