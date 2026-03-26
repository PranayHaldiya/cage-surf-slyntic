"use client";

import { useState } from "react";
import type { SafetyAnalyzeResponse } from "~/lib/safety/types";
import { checklistForVerdict } from "~/lib/safety/evidence";
import { buildSafetySpeech } from "~/lib/safety/voice";

function verdictUi(verdict: SafetyAnalyzeResponse["verdict"]) {
  if (verdict === "likely_scam") {
    return {
      label: "This may be a scam",
      badgeClass: "bg-red-500/15 text-red-300 border-red-400/30",
    };
  }

  if (verdict === "suspicious") {
    return {
      label: "Be careful",
      badgeClass: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    };
  }

  return {
    label: "Looks okay",
    badgeClass: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  };
}

export function SafetyCheckCard() {
  const [claimText, setClaimText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SafetyAnalyzeResponse | null>(null);

  const canAnalyze = claimText.trim().length >= 10;

  async function onAnalyze() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/safety/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimText }),
      });

      const json = (await res.json()) as SafetyAnalyzeResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not complete safety check.");
        return;
      }

      setResult(json);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onSpeak() {
    if (!result) return;

    const speechText = buildSafetySpeech({
      verdict: result.verdict,
      score: result.score,
      reasons: result.reasons,
    });

    try {
      const res = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "speak", text: speechText }),
      });
      const json = (await res.json()) as { audio?: string; mediaType?: string; error?: string };
      if (!res.ok || !json.audio || !json.mediaType) {
        setError(json.error ?? "Could not generate voice guidance.");
        return;
      }
      const audio = new Audio(`data:${json.mediaType};base64,${json.audio}`);
      await audio.play();
    } catch {
      setError("Could not play voice guidance.");
    }
  }

  const verdictDisplay = result ? verdictUi(result.verdict) : null;

  return (
    <section className="mt-14 w-full max-w-4xl rounded-3xl border border-white/10 bg-[#121821] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.25)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight text-[#E4E2DC]">
            Check if something is safe
          </h2>
          <p className="mt-2 max-w-2xl text-base text-[#9AA0A6]">
            Paste a suspicious message, payment request, support call claim, or website instruction. Cage Surf will explain whether it looks safe before you act.
          </p>
        </div>
        <div className="rounded-2xl border border-[#34D399]/20 bg-[#34D399]/8 px-4 py-3 text-sm text-[#B8F5DB]">
          Powered by Slyntic safety checks
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <textarea
            value={claimText}
            onChange={(e) => setClaimText(e.target.value)}
            placeholder="Example: Your bank account will be blocked in 10 minutes. Share OTP now and approve the UPI collect request."
            className="min-h-44 w-full rounded-2xl border border-white/10 bg-[#0C0F15] px-4 py-4 text-base text-[#E4E2DC] outline-none placeholder:text-[#6F7680] focus:border-[#34D399]/40"
          />
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onAnalyze}
              disabled={!canAnalyze || loading}
              className="cursor-pointer rounded-full bg-[#34D399] px-6 py-3 text-base font-semibold text-[#0C0F15] transition hover:bg-[#2BBD88] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Checking..." : "Check safety"}
            </button>
            <button
              onClick={() => setClaimText("A caller says they are from my bank and I must share OTP immediately or my account will be frozen.")}
              className="cursor-pointer rounded-full border border-white/10 px-5 py-3 text-sm text-[#D8D5CC] transition hover:border-[#34D399]/30 hover:text-white"
            >
              Try demo example
            </button>
          </div>
          {error && <p className="text-sm text-[#FF8B8B]">{error}</p>}
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#0C0F15] p-5">
          {result ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full border px-3 py-1 text-sm font-medium ${verdictDisplay?.badgeClass}`}>
                  {verdictDisplay?.label}
                </span>
                <span className="text-sm text-[#A1A7AF]">Risk score {result.score}/100</span>
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6F7680]">Why</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#D8D5CC]">
                  {result.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6F7680]">What to do next</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#D8D5CC]">
                  {checklistForVerdict(result.verdict).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onSpeak}
                  className="cursor-pointer rounded-full border border-[#34D399]/30 px-4 py-2 text-sm text-[#B8F5DB] transition hover:bg-[#34D399]/10"
                >
                  Speak guidance
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-56 items-center justify-center text-center text-sm text-[#7C838C]">
              Paste a message or instruction to get a clear safety explanation before continuing.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
