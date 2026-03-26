import type { Verdict } from "./types";

export function buildSafetySpeech(params: {
  verdict: Verdict;
  score: number;
  reasons: string[];
}) {
  const { verdict, score, reasons } = params;

  const verdictLine =
    verdict === "likely_scam"
      ? "This looks very risky."
      : verdict === "suspicious"
        ? "This may be unsafe. Please verify carefully."
        : "I do not see strong scam signs, but you should still be cautious.";

  const topReasons = reasons.slice(0, 3);
  const reasonsLine =
    topReasons.length > 0
      ? `Here is why: ${topReasons.join(", ")}.`
      : "I could not find strong warning signs in the information provided.";

  const actionLine =
    verdict === "likely_scam"
      ? "Do not share personal codes or payment details. Use the official website or app to verify the request."
      : verdict === "suspicious"
        ? "Please pause and verify through an official website, official app, or trusted family member."
        : "Still check links and identity carefully before continuing.";

  return `Safety check result. ${verdict.replace("_", " ")}. Risk score ${score} out of 100. ${verdictLine} ${reasonsLine} ${actionLine}`;
}
