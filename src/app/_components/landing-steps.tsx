const steps = [
  {
    title: "Say what you need help with",
    description:
      "Ask in plain language by voice or text. Cage Surf listens like a patient guide, not a complicated website.",
  },
  {
    title: "Get step-by-step browsing help",
    description:
      "Cage Surf opens pages, explains what they mean, and helps with forms, logins, and confusing next steps.",
  },
  {
    title: "Stay safe before you act",
    description:
      "If a message, payment request, or website instruction looks suspicious, Cage Surf warns you and explains what to do next.",
  },
];

export function LandingSteps() {
  return (
    <section aria-labelledby="steps-heading" className="px-6 py-28 md:py-36">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2
            id="steps-heading"
            className="font-[family-name:var(--font-syne)] text-base font-bold lowercase tracking-[0.15em] text-[#878A90] md:text-lg"
          >
            How Cage Surf helps
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-[#9AA0A6]">
            Calm, guided browsing for older adults — with built-in safety checks whenever something feels off.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <div key={i} className="soft-panel rounded-[1.75rem] p-8">
              <span
                aria-hidden="true"
                className="inline-flex rounded-full border border-[#34D399]/20 bg-[#34D399]/10 px-3 py-1 text-sm font-bold tracking-widest text-[#B8F5DB]"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-5 font-[family-name:var(--font-syne)] text-2xl font-bold leading-tight text-[#EDEAE3] md:text-[2rem]">
                {step.title}
              </h3>
              <p className="mt-4 text-lg leading-relaxed text-[#96A0AA]">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
