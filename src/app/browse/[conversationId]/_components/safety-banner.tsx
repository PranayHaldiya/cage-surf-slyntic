import type { SafetyAnalyzeResponse } from "~/lib/safety/types";
import { checklistForVerdict } from "~/lib/safety/evidence";

export function SafetyBanner({
  result,
  onSpeak,
  onDismiss,
}: {
  result: SafetyAnalyzeResponse;
  onSpeak: () => void;
  onDismiss: () => void;
}) {
  const tone =
    result.verdict === "likely_scam"
      ? {
          container: "border-red-400/30 bg-red-500/10",
          badge: "bg-red-500/15 text-red-200 border-red-400/30",
          title: "This may be a scam",
        }
      : result.verdict === "suspicious"
        ? {
            container: "border-amber-400/30 bg-amber-500/10",
            badge: "bg-amber-500/15 text-amber-100 border-amber-400/30",
            title: "Be careful before continuing",
          }
        : {
            container: "border-emerald-400/30 bg-emerald-500/10",
            badge: "bg-emerald-500/15 text-emerald-100 border-emerald-400/30",
            title: "No strong warning signs found",
          };

  return (
    <div className={`mx-4 mt-4 rounded-2xl border p-4 ${tone.container}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${tone.badge}`}>
            {tone.title}
          </div>
          <p className="mt-3 text-sm text-[#E4E2DC]">
            Risk score {result.score}/100 · {result.reasons.slice(0, 2).join(" • ") || "No major red flags"}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="cursor-pointer rounded-md px-2 py-1 text-sm text-[#AAB1B8] hover:bg-white/5 hover:text-white"
        >
          Dismiss
        </button>
      </div>

      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#D8D5CC]">
        {checklistForVerdict(result.verdict).slice(0, 3).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={onSpeak}
          className="cursor-pointer rounded-full border border-[#34D399]/30 px-4 py-2 text-sm text-[#B8F5DB] transition hover:bg-[#34D399]/10"
        >
          Speak guidance
        </button>
      </div>
    </div>
  );
}
