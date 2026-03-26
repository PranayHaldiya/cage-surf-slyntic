# README Refactor Design

**Date:** 2026-03-01
**Goal:** Refactor the CageSurf README to be accurate, add a "How It Works" section with a Mermaid diagram, and update Features/Getting Started to reflect the current codebase.

## Structure (Product-first)

1. **Header + Tagline** — keep as-is
2. **The Problem** — keep as-is
3. **The Solution** — keep as-is
4. **Features** — updated to reflect actual capabilities + voice chat
5. **How It Works** — NEW section with Mermaid flowchart + explanatory paragraph
6. **Tech Stack** — updated to be accurate
7. **Getting Started** — updated (pnpm, correct repo URL, Doppler/local env setup)

## Features (updated)

- Conversational Browsing — text or voice chat with an AI agent that browses for you
- Voice Chat — hold-to-talk mic with speech-to-text, auto-read AI responses aloud
- Smart Screen Summaries — AI summarizes pages and asks clarifying questions to guide you
- Web Search — find information without navigating complex search engines
- Senior-Friendly Design — large, clear interface with minimal cognitive load

## How It Works

Mermaid flowchart showing the core loop:

```
User → (text or voice) → Chat Interface → AI Agent → Browser Session → (page summary) → AI Agent → (response) → Chat Interface → User
```

Short paragraph explaining the flow: user sends a message, AI decides whether to search/browse/respond, controls a cloud browser if needed, summarizes pages with follow-up questions, responds via text and optionally audio.

## Tech Stack (corrected)

- Next.js 15, React 19, TypeScript
- Vercel AI SDK + AI Gateway
- BrowserUse SDK (cloud browser automation)
- ElevenLabs (speech-to-text & text-to-speech)
- better-auth (Google OAuth)
- Prisma + PostgreSQL
- Upstash Redis
- Tailwind CSS + shadcn/ui
- tRPC

## Getting Started (corrected)

- pnpm (not npm)
- Correct repo URL: `PranayHaldiya/cage-surf`
- Mention Doppler for env management or `.env` for local dev
- Use `pnpm db:push` instead of `npx prisma migrate dev`
- Use `pnpm dev:local` for local dev without Doppler
