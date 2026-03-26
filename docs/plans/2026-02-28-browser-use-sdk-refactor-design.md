# Browser-Use SDK v3 Refactor

## Problem

The current browser-use integration uses raw `fetch` calls against the Cloud API with manual 2-second polling. This is ~99 lines of brittle code when the `browser-use-sdk` (already installed) handles all of this automatically.

## Goals

- **Speed & responsiveness**: keepAlive sessions so the browser stays warm between tasks
- **Step-by-step visibility**: path to streaming browser step updates to the user
- **Simplicity**: replace raw fetch with the v3 SDK (~20 lines)

## Approach

Use the v3 SDK (`browser-use-sdk/v3`) with its unified session model. One session per conversation, keepAlive enabled, SDK handles polling internally.

## Changes

### 1. `src/server/services/browser-use.ts` — full rewrite

Replace all raw fetch code with v3 SDK wrapper:
- `createBrowserSession()` — `client.sessions.create({ keepAlive: true })`
- `runBrowserTask(sessionId, task)` — `client.run(task, { sessionId })`
- `getSessionStatus(sessionId)` — `client.sessions.get(sessionId)`
- `stopBrowserSession(sessionId)` — `client.sessions.stop(sessionId)`

Delete: `createBrowserTask`, `pollTaskUntilDone`, `getTaskStatus`, `pauseTask`, `resumeTask`, all raw fetch/headers.

### 2. `src/lib/ai/tools.ts` — simplify browse tool

Replace `createBrowserTask` + `pollTaskUntilDone` with single `runBrowserTask` call. `renderScreenTool` unchanged.

### 3. `src/server/api/routers/conversation.ts` — swap imports

- `createBrowserSession` replaces old version (no `startUrl` param — agent navigates via first browse call)
- `stopBrowserSession` replaces `deleteBrowserSession`

### 4. `src/app/api/chat/route.ts` — no changes

Chat route uses tools, doesn't touch browser-use directly.

## Future Enhancement

Stream step visibility by polling `getSessionStatus()` during task execution and relaying updates through the Vercel AI SDK data stream (e.g. "Opening Google...", "Searching for flights...").

## Risk

v3 SDK is marked "experimental" but is at v3.1.0 with typed APIs. Fallback: revert to v2 SDK which has the same benefits over raw fetch.
