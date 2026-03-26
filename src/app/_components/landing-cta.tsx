import { SignInButton } from "~/app/_components/sign-in-button";
import { ArrowIcon } from "~/app/_components/arrow-icon";

export function LandingCta() {
  return (
    <section aria-labelledby="cta-heading" className="px-6 py-28 text-center md:py-36">
      <div className="mx-auto max-w-4xl rounded-[2rem] border border-white/8 bg-[#121922] px-8 py-14 shadow-[0_24px_80px_rgba(0,0,0,0.22)] md:px-12">
        <h2
          id="cta-heading"
          className="font-[family-name:var(--font-syne)] text-4xl font-extrabold tracking-[-0.02em] text-[#EDEAE3] md:text-6xl"
        >
          Browse with more confidence.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#97A0AA] md:text-xl">
          Cage Surf helps older adults understand websites, move through tasks more easily, and pause when something does not feel safe.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <SignInButton className="btn-shine group cursor-pointer rounded-full bg-[#34D399] px-12 py-5 text-lg font-semibold text-[#0C0F15] transition-all duration-500 hover:bg-[#2BBD88] hover:shadow-[0_0_40px_rgba(52,211,153,0.3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34D399]">
            <span className="flex items-center gap-3">
              Start browsing safely
              <ArrowIcon />
            </span>
          </SignInButton>
        </div>
      </div>
    </section>
  );
}
