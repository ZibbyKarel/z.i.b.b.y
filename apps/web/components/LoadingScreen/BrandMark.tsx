/* eslint-disable react/forbid-dom-props -- Orbiting HUD elements (ripple, ring-pulse, orbit-spin, orbit dot) use brand-specific computed inline styles with no DS prop equivalent. */
import type { ReactNode } from "react";
import { ACCENT } from "./constants";

interface BrandMarkProps {
  logo: ReactNode;
  testId: string;
}

export function BrandMark({ logo, testId }: BrandMarkProps) {
  return (
    <div className="relative mb-11 flex h-[220px] w-[220px] items-center justify-center">
      <div className="animate-ripple absolute inset-0 rounded-full" style={{ background: "rgba(91,141,239,0.08)" }} />
      <div className="animate-ripple absolute inset-0 rounded-full" style={{ background: "rgba(91,141,239,0.05)", animationDelay: "1.4s" }} />
      <div
        className="animate-ring-pulse absolute rounded-full"
        style={{ inset: -28, border: "1px solid rgba(91,141,239,0.12)", animationDelay: "0.7s" }}
      />
      <div
        className="animate-ring-pulse absolute rounded-full"
        style={{ inset: -10, border: "1.5px solid rgba(91,141,239,0.3)" }}
      />
      <div className="animate-orbit-spin absolute rounded-full" style={{ inset: -22, border: "1px solid rgba(91,141,239,0.18)" }}>
        <div
          className="absolute left-1/2 rounded-full"
          style={{
            top: -3.5,
            height: 7,
            width: 7,
            marginLeft: -3.5,
            background: ACCENT,
            boxShadow: "0 0 12px 4px rgba(91,141,239,0.7)",
          }}
        />
      </div>
      <div
        className="animate-logo-breathe h-[220px] w-[220px] overflow-hidden rounded-full"
        data-testid={testId}
      >
        {logo}
      </div>
    </div>
  );
}
