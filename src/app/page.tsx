import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { GrainOverlay } from "~/app/_components/grain-overlay";
import { LandingNav } from "~/app/_components/landing-nav";
import { LandingHero } from "~/app/_components/landing-hero";
import { LandingMarquee } from "~/app/_components/landing-marquee";
import { LandingSteps } from "~/app/_components/landing-steps";
import { LandingCta } from "~/app/_components/landing-cta";

export default async function Home() {
  const session = await getSession();

  if (session) {
    redirect("/browse");
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0C0F15] text-[#E4E2DC] selection:bg-[#34D399]/20" style={{ colorScheme: "dark" }}>
      {/* skip to content */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-[#E4E2DC] focus:px-4 focus:py-3 focus:text-[#0C0F15] focus:text-base focus:font-medium"
      >
        Skip to main content
      </a>

      <GrainOverlay />

      <LandingNav />

      <main id="main">
        <LandingHero />

        <LandingMarquee />

        <LandingSteps />

        <LandingCta />
      </main>

      {/* footer with jungle canopy */}
      <footer className="relative overflow-hidden text-center">
        <svg
          className="block w-full"
          viewBox="0 0 1440 165"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="canopy-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0C0F15" />
              <stop offset="100%" stopColor="#0A1A16" />
            </linearGradient>
            <linearGradient id="canopy-mid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#081410" />
              <stop offset="100%" stopColor="#06100C" />
            </linearGradient>
            <linearGradient id="canopy-near" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06100C" />
              <stop offset="100%" stopColor="#040C08" />
            </linearGradient>
            <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#040C08" />
              <stop offset="100%" stopColor="#030907" />
            </linearGradient>
          </defs>

          {/* bg fill */}
          <rect width="1440" height="200" fill="#0C0F15" />
          {/* far canopy — rolling tree tops */}
          <path d="M0 50 C60 28, 140 65, 240 38 C320 18, 420 55, 520 32 C600 14, 700 50, 800 35 C880 22, 960 52, 1060 30 C1140 14, 1240 55, 1340 40 C1400 30, 1430 45, 1440 50 L1440 200 L0 200 Z" fill="url(#canopy-far)" />
          {/* fireflies */}
          <circle cx="180" cy="45" r="1.5" fill="#34D399" opacity="0.5" />
          <circle cx="520" cy="30" r="1" fill="#34D399" opacity="0.35" />
          <circle cx="850" cy="40" r="1.5" fill="#34D399" opacity="0.45" />
          <circle cx="1200" cy="35" r="1" fill="#34D399" opacity="0.3" />
          <circle cx="1380" cy="48" r="1.2" fill="#34D399" opacity="0.4" />
          {/* mid canopy */}
          <path d="M0 80 C100 60, 220 95, 360 70 C460 52, 580 88, 700 65 C800 50, 900 82, 1020 72 C1120 64, 1220 90, 1340 68 C1400 58, 1430 75, 1440 80 L1440 200 L0 200 Z" fill="url(#canopy-mid)" />
          {/* near canopy with texture */}
          <path d="M0 110 C90 95, 180 120, 290 100 C380 85, 480 115, 580 105 C660 98, 760 118, 860 102 C940 90, 1040 112, 1140 105 C1220 100, 1320 120, 1400 105 C1430 98, 1440 108, 1440 110 L1440 200 L0 200 Z" fill="url(#canopy-near)" />
          {/* leaf vein hints */}
          <g opacity="0.12" stroke="#34D399" strokeWidth="0.8" fill="none">
            <path d="M280 100 Q295 80 310 98" />
            <path d="M640 102 Q658 82 668 100" />
            <path d="M1050 105 Q1068 85 1078 103" />
          </g>
          {/* forest floor */}
          <path d="M0 135 C200 125, 400 140, 600 130 C800 122, 1000 138, 1200 132 C1350 128, 1420 135, 1440 135 L1440 200 L0 200 Z" fill="url(#ground)" />
          {/* tiny mushrooms */}
          <g opacity="0.2">
            <circle cx="400" cy="142" r="3" fill="#34D399" />
            <rect x="399" y="142" width="2" height="5" fill="#1C6B50" />
            <circle cx="1050" cy="138" r="2.5" fill="#34D399" />
            <rect x="1049" y="138" width="2" height="4" fill="#1C6B50" />
          </g>
        </svg>
        <div className="bg-[#030907] px-8 py-1.5">
          <span className="font-[family-name:var(--font-syne)] text-base lowercase tracking-[0.1em] text-[#34D399]/50">
            cagesurf &copy; 2026
          </span>
        </div>
      </footer>
    </div>
  );
}
