import { SignInButton } from "~/app/_components/sign-in-button";
import { ArrowIcon } from "~/app/_components/arrow-icon";
import { BounceDot } from "~/app/_components/bounce-dot";

export function LandingHero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-20 pb-28"
    >
      <div className="relative max-w-5xl text-center">
        <h1
          id="hero-heading"
          className="landing-reveal font-[family-name:var(--font-syne)] text-[clamp(2.25rem,8vw,7rem)] font-extrabold lowercase leading-[0.95] tracking-[-0.02em] text-[#E4E2DC]"
        >
          the internet,
          <br />
          <BounceDot>
            <span className="text-[#34D399]">made easy</span>
          </BounceDot>
        </h1>
        {/* tropical leaf — right */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-[10%] top-[58%] w-[140px] rotate-[20deg] opacity-[0.25] md:w-[220px]"
          viewBox="0 0 100 160"
          fill="none"
        >
          <path d="M50 0 C50 0, 20 40, 15 80 C10 120, 30 155, 50 160 C70 155, 90 120, 85 80 C80 40, 50 0, 50 0 Z" fill="#34D399" />
          <path d="M50 10 L50 150" stroke="#0C0F15" strokeWidth="1.5" opacity="0.4" />
          <path d="M50 30 L30 55" stroke="#0C0F15" strokeWidth="1" opacity="0.3" />
          <path d="M50 50 L25 80" stroke="#0C0F15" strokeWidth="1" opacity="0.3" />
          <path d="M50 70 L22 105" stroke="#0C0F15" strokeWidth="1" opacity="0.3" />
          <path d="M50 40 L72 60" stroke="#0C0F15" strokeWidth="1" opacity="0.3" />
          <path d="M50 60 L75 85" stroke="#0C0F15" strokeWidth="1" opacity="0.3" />
          <path d="M50 80 L78 110" stroke="#0C0F15" strokeWidth="1" opacity="0.3" />
        </svg>

        {/* tropical leaf — left */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -left-[8%] top-[52%] w-[80px] -rotate-[30deg] scale-x-[-1] opacity-[0.18] md:w-[130px]"
          viewBox="0 0 100 160"
          fill="none"
        >
          <path d="M50 0 C50 0, 20 40, 15 80 C10 120, 30 155, 50 160 C70 155, 90 120, 85 80 C80 40, 50 0, 50 0 Z" fill="#34D399" />
          <path d="M50 10 L50 150" stroke="#0C0F15" strokeWidth="1.5" opacity="0.4" />
          <path d="M50 30 L30 55" stroke="#0C0F15" strokeWidth="1" opacity="0.3" />
          <path d="M50 50 L25 80" stroke="#0C0F15" strokeWidth="1" opacity="0.3" />
          <path d="M50 40 L72 60" stroke="#0C0F15" strokeWidth="1" opacity="0.3" />
          <path d="M50 60 L75 85" stroke="#0C0F15" strokeWidth="1" opacity="0.3" />
        </svg>

        <p className="landing-reveal landing-reveal-delay-1 mx-auto mt-8 max-w-2xl text-xl leading-relaxed text-[#878A90] md:text-2xl">
          CageSurf helps older adults browse websites with voice or text, explains confusing pages in simple language, and warns when something looks unsafe.
        </p>
        <div className="landing-reveal landing-reveal-delay-2 mt-12 flex flex-col items-center gap-3">
          <SignInButton className="btn-shine group relative cursor-pointer rounded-full bg-[#34D399] px-12 py-5 text-lg font-semibold text-[#0C0F15] transition-all duration-500 hover:bg-[#2BBD88] hover:shadow-[0_0_40px_rgba(52,211,153,0.3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34D399]">
            <span className="flex items-center gap-3">
              Start browsing safely
              <ArrowIcon />
            </span>
          </SignInButton>
        </div>
      </div>

      {/* scroll indicator */}
      <div
        aria-hidden="true"
        className="landing-reveal landing-reveal-delay-3 absolute bottom-8 flex flex-col items-center gap-2"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-[#555860]">
          scroll
        </span>
        <div className="h-10 w-px animate-pulse bg-[#E4E2DC]/15" />
      </div>
    </section>
  );
}
