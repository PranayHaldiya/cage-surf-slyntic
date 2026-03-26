import type { SafetyAnalyzeResponse } from "./types";
import { extractEntities, extractSignals } from "./parser";
import { rankEvidence } from "./evidence";
import { fetchEvidence } from "./firecrawl";
import { reasonsFromSignals, scoreSignals, verdictFromScore } from "./risk";

const suspiciousDomainHints = [
  "bit.ly",
  "tinyurl",
  "rb.gy",
  "t.co",
  "telegram.me",
  "wa.me",
  "support-",
  "verify-",
  "secure-",
  "update-kyc",
  "claim-reward",
];

function browserReasons(url: string, text: string): string[] {
  const reasons: string[] = [];
  const lower = url.toLowerCase();
  if (suspiciousDomainHints.some((hint) => lower.includes(hint))) {
    reasons.push("The website address looks unusual or shortened.");
  }
  if (/login|verify|secure|update|kyc/i.test(text) && /otp|pin|password|cvv/i.test(text)) {
    reasons.push("This page appears to mix verification language with sensitive credential requests.");
  }
  if (/urgent|immediately|now|legal action|blocked|suspend/i.test(text)) {
    reasons.push("This page uses pressure or threat language.");
  }
  return reasons;
}

export async function analyzeBrowserState(params: {
  url?: string | null;
  pageText?: string | null;
}): Promise<SafetyAnalyzeResponse | null> {
  const url = params.url?.trim() ?? "";
  const pageText = params.pageText?.trim() ?? "";
  const combined = [url, pageText].filter(Boolean).join("\n");
  if (combined.length < 8) return null;

  const entities = extractEntities(combined);
  const signals = extractSignals(combined);
  const score = scoreSignals(signals);
  const verdict = verdictFromScore(score);
  const reasons = [
    ...browserReasons(url, pageText),
    ...reasonsFromSignals(signals),
  ];

  const evidence = rankEvidence(
    await fetchEvidence(`${url} ${pageText.slice(0, 180)} scam warning fraud`),
    5,
  );

  return {
    claimText: combined,
    score,
    verdict,
    signals,
    reasons,
    evidence,
    entities,
    generatedAt: new Date().toISOString(),
  };
}
