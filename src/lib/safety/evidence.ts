import type { EvidenceItem, Verdict } from "./types";

const trustedDomainHints = [
  ".gov",
  ".gov.in",
  ".org",
  "bank",
  "rbi.org.in",
  "sbi.co.in",
  "hdfcbank.com",
  "icicibank.com",
  "axisbank.com",
  "microsoft.com",
  "google.com",
  "amazon.in",
  "amazon.com",
];

const lowSignalDomainHints = ["reddit.com", "quora.com", "medium.com", "youtube.com", "x.com"];

function scoreUrl(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;
  if (trustedDomainHints.some((d) => lower.includes(d))) score += 30;
  if (lower.startsWith("https://")) score += 5;
  if (lowSignalDomainHints.some((d) => lower.includes(d))) score -= 12;
  return score;
}

export function rankEvidence(items: EvidenceItem[], limit = 5): EvidenceItem[] {
  return [...items].sort((a, b) => scoreUrl(b.url) - scoreUrl(a.url)).slice(0, limit);
}

export function checklistForVerdict(verdict: Verdict): string[] {
  if (verdict === "likely_scam") {
    return [
      "Do NOT share OTP, PIN, CVV, or passwords.",
      "Do NOT approve any UPI collect request.",
      "Use the official website or app to verify the request.",
      "Block or report the sender/number if possible.",
      "If money was lost, contact your bank and cybercrime support immediately.",
    ];
  }

  if (verdict === "suspicious") {
    return [
      "Pause before acting and verify from official channels.",
      "Do not click links before checking the domain carefully.",
      "Do not trust urgency language on its own.",
      "Cross-check using the official app or verified support page.",
    ];
  }

  return [
    "No strong red flags detected, but still verify identities carefully.",
    "Avoid sharing sensitive credentials over calls or messages.",
    "Double-check links and domains before login or payment.",
  ];
}
