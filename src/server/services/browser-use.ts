import { BrowserUse } from "browser-use-sdk";

const client = new BrowserUse();

export async function createBrowserSession(startUrl?: string) {
  const session = await client.sessions.create({
    startUrl: startUrl ?? "https://www.google.com",
    keepAlive: true,
    persistMemory: true,
    browserScreenWidth: 1280,
    browserScreenHeight: 1024,
  });
  return { id: session.id, liveUrl: session.liveUrl, status: session.status };
}

export async function isBrowserSessionAlive(sessionId: string): Promise<boolean> {
  try {
    const session = await client.sessions.get(sessionId);
    return session.status === "active";
  } catch {
    return false;
  }
}

export async function runBrowserTask(sessionId: string, task: string) {
  const created = await client.tasks.create({
    task,
    sessionId,
  });
  const result = await client.tasks.wait(created.id);
  // grab the last step's screenshot url if available
  const steps = result.steps ?? [];
  const screenshotUrl = [...steps].reverse().find((s) => s.screenshotUrl)?.screenshotUrl ?? null;
  return { output: result.output ?? "Task completed.", status: result.status, screenshotUrl };
}

export async function stopBrowserSession(sessionId: string) {
  await client.sessions.stop(sessionId);
}
