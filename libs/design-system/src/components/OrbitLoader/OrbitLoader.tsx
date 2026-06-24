import type { CSSProperties, Ref } from "react";
import { Stack } from "../Stack/Stack";
import { Typography, type TypographySize } from "../Typography/Typography";

export type OrbitLoaderSize = "sm" | "md" | "lg";

export enum OrbitLoaderTestId {
  Root = "orbit-loader-root",
  Orbit = "orbit-loader-orbit",
  Label = "orbit-loader-label",
}

/** Outer diameter / part sizes per semantic size. */
const sizeSpec: Record<
  OrbitLoaderSize,
  { box: number; core: number; dot: number; ring: number; label: TypographySize }
> = {
  sm: { box: 28, core: 7, dot: 4, ring: 1.5, label: "caption" },
  md: { box: 48, core: 11, dot: 6, ring: 2, label: "sm" },
  lg: { box: 96, core: 20, dot: 9, ring: 2.5, label: "base" },
};

/** Accent colour at a given opacity — keeps the orbit on the theme accent token. */
const accent = (pct: number) => `color-mix(in srgb, var(--color-accent) ${pct}%, transparent)`;

export interface OrbitLoaderProps {
  /** Diameter of the orbit. Default `"md"`. */
  size?: OrbitLoaderSize;
  /** Optional mono caption rendered below the orbit (e.g. a localised "Loading…"). */
  label?: string;
  ref?: Ref<HTMLElement>;
}

/**
 * Indeterminate loading orbit — the in-page twin of the boot splash. A glowing accent
 * core breathes at the centre while a dot orbits a faint HUD ring and two rings pulse.
 * Reuses the shared `orbit-spin` / `ring-pulse` keyframes; all motion is suppressed under
 * `prefers-reduced-motion`, leaving a static glow. Render it wherever content is loading.
 */
export function OrbitLoader({ size = "md", label, ref }: OrbitLoaderProps) {
  const { box, core, dot, ring, label: labelSize } = sizeSpec[size];
  const orbitInset = box * 0.14;
  const innerInset = box * 0.32;

  const ringBase = "absolute rounded-full motion-reduce:animate-none";
  const fill: CSSProperties = { inset: 0 };

  return (
    <Stack
      align="center"
      aria-label={label ?? "Loading"}
      data-testid={OrbitLoaderTestId.Root}
      gap="150"
      ref={ref}
      role="status"
    >
      <span
        aria-hidden
        className="relative inline-flex shrink-0 items-center justify-center"
        data-testid={OrbitLoaderTestId.Orbit}
        style={{ width: box, height: box }}
      >
        {/* Outer track — faint HUD ring, gently pulsing. */}
        <span
          className={`${ringBase} animate-ring-pulse`}
          style={{ ...fill, border: `${ring}px solid ${accent(14)}` }}
        />
        {/* Orbit ring carrying the travelling dot. */}
        <span
          className={`${ringBase} animate-orbit-spin`}
          style={{ inset: orbitInset, border: `${ring}px solid ${accent(20)}` }}
        >
          <span
            className="absolute left-1/2 rounded-full"
            style={{
              top: -dot / 2,
              marginLeft: -dot / 2,
              width: dot,
              height: dot,
              background: "var(--color-accent)",
              boxShadow: `0 0 ${dot * 2}px ${dot * 0.7}px ${accent(70)}`,
            }}
          />
        </span>
        {/* Inner ring — stronger, pulsing slightly out of phase. */}
        <span
          className={`${ringBase} animate-ring-pulse`}
          style={{
            inset: innerInset,
            border: `${Math.max(1, ring - 0.5)}px solid ${accent(32)}`,
            animationDelay: "0.7s",
          }}
        />
        {/* Glowing accent core. */}
        <span
          className="animate-ring-pulse rounded-full motion-reduce:animate-none"
          style={{
            width: core,
            height: core,
            background: "var(--color-accent)",
            boxShadow: `0 0 ${box * 0.3}px ${core * 0.45}px ${accent(55)}`,
          }}
        />
      </span>
      {label ? (
        <Typography
          mono
          data-testid={OrbitLoaderTestId.Label}
          size={labelSize}
          tracking="wider"
          type="note"
          variant="tertiary"
        >
          {label}
        </Typography>
      ) : null}
    </Stack>
  );
}
