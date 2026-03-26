# AGENTS.md — Cage Surf Project Context

## Project
Cage Surf is becoming a voice-first safe browsing assistant for older adults.

## Product Direction
- Main app: Cage Surf
- Internal safety engine: Slyntic
- Goal: help older adults browse websites safely, understand confusing pages, and avoid scams before taking action.

## What Has Been Implemented

### Safety Engine Migration
Added the first Slyntic migration layer into Cage Surf:
- `src/lib/safety/types.ts`
- `src/lib/safety/parser.ts`
- `src/lib/safety/risk.ts`
- `src/lib/safety/http.ts`
- `src/lib/safety/rate-limit.ts`
- `src/lib/safety/evidence.ts`
- `src/lib/safety/firecrawl.ts`
- `src/lib/safety/voice.ts`
- `src/app/api/safety/analyze/route.ts`

### UI Integration
Added first visible merged UI surfaces:
- `src/app/browse/_components/safety-check-card.tsx`
- integrated into `src/app/browse/_components/browse-home.tsx`
- `src/app/browse/[conversationId]/_components/safety-banner.tsx`
- updated `src/app/browse/[conversationId]/_components/browse-session.tsx` to run safety checks on user messages and show inline safety warnings

### Product / Copy Refactor
Updated Cage Surf positioning toward senior-safe browsing:
- `src/app/layout.tsx`
- `src/app/_components/landing-hero.tsx`
- `src/app/browse/_components/browse-home.tsx`

### Styling / Visual Direction
Started UI revamp for a calmer, more trustworthy, senior-friendly experience:
- updated `src/styles/globals.css`
- visual direction: warm, calm, readable, safety-first

## Current UX Direction
- Large readable surfaces
- Guided task-first flows
- Calm warnings instead of alarmist cybersecurity styling
- Voice/text-first support
- Safety checks should feel native, not bolted on

## Next Recommended Steps
1. Continue chat session polish for better readability and calmer interactions
2. Refactor landing supporting sections (`steps`, `cta`, etc.) to match new product story
3. Update README to reflect final product direction
4. Deepen safety integration into browse/page state, not only user messages

## Notes
- Environment validation in Cage Surf may block lint/build in some local contexts unless all required env vars are present.
- Focus has intentionally been on shipping product integration first, then cleanup/validation.
