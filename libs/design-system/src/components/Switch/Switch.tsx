import type { Ref } from "react";
import { cn } from "../../utils/cn";

export enum SwitchTestId {
  Root = "switch-root",
  Thumb = "switch-thumb",
}

export type SwitchSize = "sm" | "md";

/** Track dimensions per size, sealed to a small scale. */
const track: Record<SwitchSize, string> = {
  sm: "h-[20px] w-[36px] p-[2px]",
  md: "h-[26px] w-[46px] p-[3px]",
};

const thumb: Record<SwitchSize, string> = {
  sm: "size-[14px]",
  md: "size-[18px]",
};

export interface SwitchProps {
  /** Controlled on/off state. */
  checked: boolean;
  /** Fired with the next state when the user toggles. */
  onChange: (next: boolean) => void;
  /** Accessible name — required since the control has no visible text. */
  label: string;
  size?: SwitchSize;
  disabled?: boolean;
  /** Control id — set by `Field`/`Toggle` to wire a visible `<label htmlFor>`. */
  id?: string;
  /** Id of a describing message — set by `Field`/`Toggle`. */
  "aria-describedby"?: string;
  /** Invalid flag — set by `Field`/`Toggle`. */
  "aria-invalid"?: boolean;
  /** Overrides the default root test id (e.g. `Toggle` re-labels it). */
  "data-testid"?: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A HUD on/off toggle. Renders a `role="switch"` button with a sliding thumb;
 * accent-lit when on, muted when off. Controlled only — the consumer owns state.
 */
export function Switch({
  checked,
  onChange,
  label,
  size = "md",
  disabled = false,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  "data-testid": testId = SwitchTestId.Root,
  ref,
}: SwitchProps) {
  return (
    <button
      aria-checked={checked}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border outline-none transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-accent",
        track[size],
        checked
          ? "justify-end border-accent bg-accent-dim"
          : "justify-start border-border bg-background",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
      data-testid={testId}
      disabled={disabled}
      id={id}
      onClick={() => onChange(!checked)}
      ref={ref}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          "rounded-full transition-all duration-150",
          thumb[size],
          checked ? "bg-accent shadow-glow-accent" : "bg-foreground-faint",
        )}
        data-testid={SwitchTestId.Thumb}
      />
    </button>
  );
}
