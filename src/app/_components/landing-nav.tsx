"use client";

import { useEffect, useState } from "react";
import { SignInButton } from "~/app/_components/sign-in-button";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      aria-label="Main navigation"
      className={`landing-reveal fixed top-0 right-0 left-0 z-40 flex items-center justify-between px-6 py-5 backdrop-blur-xl transition-[border-color,background-color] duration-300 md:px-8 ${
        scrolled
          ? "border-b border-white/[0.08] bg-[#0C0F15]/88"
          : "border-b border-transparent bg-[#0C0F15]/68"
      }`}
    >
      <div className="flex flex-col">
        <span className="font-[family-name:var(--font-syne)] text-lg font-bold tracking-tight lowercase text-[#E4E2DC]">
          cagesurf 🦜
        </span>
        <span className="text-[10px] uppercase tracking-[0.16em] text-[#6E7680]">
          browse with clarity and safety
        </span>
      </div>
      <SignInButton className="cursor-pointer rounded-full bg-transparent px-6 py-3 text-base font-semibold text-[#E4E2DC] ring-1 ring-[#E4E2DC]/15 transition-all duration-300 hover:bg-[#E4E2DC] hover:text-[#0C0F15] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34D399]">
        Sign in
      </SignInButton>
    </nav>
  );
}
