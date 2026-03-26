/**
 * Shared tool business logic — pure functions, no framework coupling.
 * Used by both the text agent (Vercel AI SDK tool wrappers) and voice agent (LiveKit llm.tool wrappers).
 */

import { BrowserUse } from "browser-use-sdk";
import Exa from "exa-js";

// Lazy-init clients (env vars injected by Next.js or Doppler at runtime)
let browserUseClient: BrowserUse;
function getBrowserUseClient() {
  if (!browserUseClient) {
    browserUseClient = new BrowserUse();
  }
  return browserUseClient;
}

export interface SearchResult {
  title: string;
  url: string;
  highlights: string[];
}

export interface BrowseResult {
  output: string;
  screenshotUrl: string | null;
}

/**
 * Web search via Exa.
 */
export async function executeWebSearch(
  query: string,
  exaApiKey: string,
): Promise<SearchResult[]> {
  const exa = new Exa(exaApiKey);
  const results = await exa.search(query, {
    type: "auto",
    numResults: 5,
    contents: {
      highlights: { maxCharacters: 300 },
    },
  });

  return results.results.map((r) => ({
    title: r.title ?? "",
    url: r.url,
    highlights: (r as { highlights?: string[] }).highlights ?? [],
  }));
}

/**
 * Browse via BrowserUse SDK.
 * ALWAYS cancels previous task if one is running.
 */
export async function executeBrowseTask(
  sessionId: string,
  instruction: string,
  activeBrowseTaskId: string | null,
): Promise<BrowseResult & { taskId: string }> {
  const client = getBrowserUseClient();

  // Cancel any previous browse task still running
  if (activeBrowseTaskId) {
    try {
      await client.tasks.stop(activeBrowseTaskId);
    } catch {
      // Task may have already finished
    }
  }

  const created = await client.tasks.create({
    task: instruction,
    sessionId,
  });

  const result = await client.tasks.wait(created.id);

  // Grab the last step's screenshot url if available
  const steps = result.steps ?? [];
  const screenshotUrl =
    [...steps].reverse().find((s) => s.screenshotUrl)?.screenshotUrl ?? null;

  return {
    output: result.output ?? "Task completed.",
    screenshotUrl,
    taskId: created.id,
  };
}

/**
 * Check if a browser session is alive. If not, create a new one
 * at the last visited URL. Returns the (possibly new) session info.
 */
export async function ensureSessionAlive(
  sessionId: string,
  lastUrl?: string,
): Promise<{ sessionId: string; liveUrl: string; revived: boolean }> {
  const client = getBrowserUseClient();
  try {
    const session = await client.sessions.get(sessionId);
    if (session.status === "active") {
      return { sessionId, liveUrl: session.liveUrl ?? "", revived: false };
    }
  } catch {
    // Session not found
  }

  // Create new session
  const newSession = await client.sessions.create({
    startUrl: lastUrl ?? "https://www.google.com",
    keepAlive: true,
    persistMemory: true,
    browserScreenWidth: 1280,
    browserScreenHeight: 1024,
  });

  return {
    sessionId: newSession.id,
    liveUrl: newSession.liveUrl ?? "",
    revived: true,
  };
}

/**
 * Get current browser session state (url, title, summary).
 * Used by voice agent to poll screen context.
 */
export async function getSessionState(sessionId: string): Promise<{
  url: string;
  title: string;
  summary: string;
  status: string;
} | null> {
  const client = getBrowserUseClient();
  try {
    const session = await client.sessions.get(sessionId);
    if (session.status !== "active") return null;

    // Get the latest task for this session to extract state
    const tasksResponse = await client.tasks.list({ sessionId });
    const taskItems = tasksResponse?.items ?? [];
    const sortedTasks = [...taskItems].sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime(),
    );
    const latestTaskSummary = sortedTasks[0];

    if (!latestTaskSummary) {
      return { url: "", title: "", summary: "", status: session.status };
    }

    // Get full task details including steps
    try {
      const fullTask = await client.tasks.get(latestTaskSummary.id);
      const steps = fullTask.steps ?? [];
      const lastStep = [...steps].reverse()[0];
      const url = (lastStep as { url?: string })?.url ?? "";
      const memory = (lastStep as { memory?: string })?.memory ?? "";

      return {
        url,
        title: "",
        summary: memory,
        status: session.status,
      };
    } catch {
      return { url: "", title: "", summary: "", status: session.status };
    }
  } catch {
    return null;
  }
}
