import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";
import { type StateTone, stateToneVar } from "../../stateTone";

export enum LivingGlowTestId {
  Root = "living-glow-root",
}

/** Ambient (`idle`) vs energized (`hot`), the two living-glow intensities,
 * mapped onto the shared `v-glow-idle` / `v-glow-hot` keyframes. */
export type LivingGlowIntensity = "idle" | "hot";

const intensityAnimation: Record<LivingGlowIntensity, string> = {
  idle: "animate-[v-glow-idle_3.6s_ease-in-out_infinite]",
  hot: "animate-[v-glow-hot_2.2s_ease-in-out_infinite]",
};

const radiusClass = {
  none: "rounded-none",
  sm: "rounded-sm",
  default: "rounded",
  lg: "rounded-lg",
  full: "rounded-full",
} as const;

export interface LivingGlowProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  /** Which state this glow expresses: the canonical vocabulary. */
  tone?: StateTone;
  /** Ambient pulse (`idle`) or the energized, in-flight pulse (`hot`). */
  intensity?: LivingGlowIntensity;
  /** Also scale/opacity-breathe (`v-breath`), for a free-standing orb-like glow;
   *  omit when the glow lines a fixed panel so its box-shadow stays flush. */
  breathe?: boolean;
  /** Corner radius of the glow shell; match it to the host card/panel. */
  radius?: keyof typeof radiusClass;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * The shared "this is alive and in `tone` state" primitive: an absolutely
 * positioned, animated glow shell tinted by the canonical {@link StateTone}. It is
 * the animated half of the living-state contract (the static half is the tone border
 * on `Card`/`Corners`/`Tag`); both the HUD (`Card living` / `HudPanel live`) and the
 * Chat-UI reuse it instead of each hand-rolling their own pulse. Reuses the
 * `v-glow-idle` / `v-glow-hot` / `v-breath` keyframes, parametrized by `--living-color`.
 *
 * Renders into its nearest positioned ancestor (`absolute inset-0`), behind content,
 * and is decorative (`aria-hidden`). Honours `prefers-reduced-motion`.
 */
export function LivingGlow({
  tone = "accent",
  intensity = "idle",
  breathe = false,
  radius = "lg",
  style,
  ref,
  ...rest
}: LivingGlowProps) {
  const toneVarStyle = { "--living-color": stateToneVar[tone] } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 motion-reduce:animate-none",
        radiusClass[radius],
        intensityAnimation[intensity],
        breathe && "will-change-transform",
      )}
      data-intensity={intensity}
      data-testid={LivingGlowTestId.Root}
      data-tone={tone}
      ref={ref}
      style={{ ...toneVarStyle, ...style }}
      {...rest}
    >
      {breathe && (
        <span className="absolute inset-0 rounded-[inherit] animate-[v-breath_4.4s_ease-in-out_infinite] motion-reduce:animate-none" />
      )}
    </span>
  );
}
