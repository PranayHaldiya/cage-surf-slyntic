"use client";

import { useCallback, useEffect, useRef } from "react";

export function BounceDot({ children }: { children: React.ReactNode }) {
  const dotRef = useRef<HTMLSpanElement>(null);

  const bounce = useCallback(() => {
    const el = dotRef.current;
    if (!el || el.getAnimations().length > 0) return;
    el.animate(
      [
        { transform: "translateY(0)" },
        { transform: "translateY(-0.18em)", offset: 0.4 },
        { transform: "translateY(0)" },
      ],
      { duration: 400, easing: "cubic-bezier(0.33, 1, 0.68, 1)" },
    );
  }, []);

  // entrance bounce
  useEffect(() => {
    const t = setTimeout(bounce, 800);
    return () => clearTimeout(t);
  }, [bounce]);

  return (
    <span onMouseEnter={bounce}>
      {children}
      <span ref={dotRef} className="inline-block text-[#34D399]/40">
        .
      </span>
    </span>
  );
}
