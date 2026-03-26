import { NextResponse } from "next/server";
import { z } from "zod";
import { extractEntities, extractSignals } from "~/lib/safety/parser";
import { fetchEvidence } from "~/lib/safety/firecrawl";
import { rankEvidence } from "~/lib/safety/evidence";
import { reasonsFromSignals, scoreSignals, verdictFromScore } from "~/lib/safety/risk";
import { buildTraceId } from "~/lib/safety/http";
import { checkRateLimit, getClientIp } from "~/lib/safety/rate-limit";
import type { SafetyAnalyzeResponse } from "~/lib/safety/types";

const requestSchema = z.object({
  claimText: z.string().min(10).max(5000),
});

export async function POST(req: Request) {
  const traceId = buildTraceId();
  const clientIp = getClientIp(req);
  const rate = checkRateLimit({ key: `safety-analyze:${clientIp}`, maxRequests: 25, windowMs: 60_000 });

  if (!rate.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded", traceId }, { status: 429 });
  }

  try {
    const body: unknown = await req.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten(), traceId }, { status: 400 });
    }

    const claimText = parsed.data.claimText;
    const entities = extractEntities(claimText);
    const signals = extractSignals(claimText);
    const score = scoreSignals(signals);
    const verdict = verdictFromScore(score);
    const reasons = reasonsFromSignals(signals);
    const evidence = rankEvidence(await fetchEvidence(`${claimText} scam warning fraud`), 5);

    const response: SafetyAnalyzeResponse = {
      claimText,
      score,
      verdict,
      signals,
      reasons,
      evidence,
      entities,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        "x-trace-id": traceId,
        "x-rate-limit-remaining": String(rate.remaining),
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error", traceId }, { status: 500 });
  }
}
