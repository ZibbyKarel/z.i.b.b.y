import type { ChipTone } from "../Chip/Chip";

export { Chip as Badge, ChipTestId as BadgeTestId } from "../Chip/Chip";
export type { ChipProps as BadgeProps } from "../Chip/Chip";

// BadgeTone excludes thinking-budget tones — those are meaningful only on model/phase chips.
export type BadgeTone = Exclude<ChipTone, "think-high" | "think-medium" | "think-low">;
