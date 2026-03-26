import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeBrowserState } from "~/lib/safety/browser";
import { buildTraceId } from "~/lib/safety/http";
import { checkRateLimit, getClientIp } from "~/lib/safety/rate-limit";

const requestSchema = z.object({
  url: z.string().optional().nullable(),
  pageText: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const traceId = buildTraceId();
  const clientIp = getClientIp(req);
  const rate = checkRateLimit({ key: `safety-browser:${clientIp}`, maxRequests: 20, windowMs: 60_000 });

  if (!rate.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded", traceId }, { status: 429 });
  }

  try {
    const body: unknown = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten(), traceId }, { status: 400 });
    }

    const result = await analyzeBrowserState(parsed.data);
    return NextResponse.json({ result, traceId }, {
      headers: {
        "x-trace-id": traceId,
        "x-rate-limit-remaining": String(rate.remaining),
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error", traceId }, { status: 500 });
  }
}
