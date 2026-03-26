const rowOne = [
  "Help me log in safely",
  "Check if this message is a scam",
  "Explain this website in simple language",
  "Help me pay my electricity bill",
  "Is this bank request safe?",
  "Guide me through this form",
  "Help me book a doctor appointment",
  "Check this payment link before I open it",
];

const rowTwo = [
  "Help me renew a government service online",
  "Tell me what this page is asking for",
  "I got a suspicious OTP request",
  "Open the official support website for me",
  "Help me track my package safely",
  "Compare the safe options on this page",
  "Read this page aloud and explain it",
  "Should I trust this urgent message?",
];

function MarqueeRow({
  items,
  reverse,
}: {
  items: string[];
  reverse?: boolean;
}) {
  const doubled = [...items, ...items];

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#0C0F15] to-transparent md:w-40" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#0C0F15] to-transparent md:w-40" />

      <div className={`flex w-max gap-3 ${reverse ? "marquee-reverse" : "marquee"}`}>
        {doubled.map((text, i) => (
          <span
            key={i}
            className="shrink-0 select-none rounded-full border border-white/[0.07] bg-[#151920] px-5 py-2.5 text-base text-[#8F98A2] shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-all duration-200 hover:border-[#34D399]/30 hover:shadow-md hover:text-[#E4E2DC]"
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LandingMarquee() {
  return (
    <section aria-hidden="true" className="py-20 md:py-28">
      <div className="mb-10 text-center">
        <h2 className="font-[family-name:var(--font-syne)] text-base font-bold lowercase tracking-[0.15em] text-[#878A90] md:text-lg">
          things you can ask Cage Surf
        </h2>
      </div>
      <div className="flex flex-col gap-4">
        <MarqueeRow items={rowOne} />
        <MarqueeRow items={rowTwo} reverse />
      </div>
    </section>
  );
}
