import type { Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Icon } from "../Icon/Icon";

export enum CheckboxTestId {
  Root = "checkbox-root",
  Box = "checkbox-box",
}

export type CheckboxSize = "sm" | "md";

/** Box dimensions per size, sealed to a small scale. */
const box: Record<CheckboxSize, string> = {
  sm: "size-[16px]",
  md: "size-[20px]",
};

const checkSize: Record<CheckboxSize, "xs" | "sm"> = {
  sm: "xs",
  md: "sm",
};

export interface CheckboxProps {
  /** Controlled checked state. */
  checked: boolean;
  /** Fired with the next state when the user toggles. Omit in presentational mode. */
  onChange?: (next: boolean) => void;
  /** Accessible name — required for interactive checkboxes (no visible text of its own). */
  label?: string;
  size?: CheckboxSize;
  disabled?: boolean;
  /**
   * Visual-only rendering: a styled box that reflects `checked` with no interactive
   * semantics (no role, no click handler, `aria-hidden`). Use when the checkbox sits
   * inside an already-interactive parent (e.g. a multi-select option `<button>`),
   * where nesting a second control would be invalid HTML and an a11y failure.
   */
  presentational?: boolean;
  /** Control id — set by `Field`/`CheckboxField` to wire a visible `<label htmlFor>`. */
  id?: string;
  /** Id of a describing message — set by `Field`. */
  "aria-describedby"?: string;
  /** Invalid flag — set by `Field`. */
  "aria-invalid"?: boolean;
  /** Overrides the default root test id. */
  "data-testid"?: string;
  ref?: Ref<HTMLButtonElement>;
}

/** The shared visual box — accent-filled with a check glyph when on, hollow when off. */
function CheckboxBox({ checked, size }: { checked: boolean; size: CheckboxSize }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm border transition-colors duration-150",
        box[size],
        checked ? "border-accent bg-accent text-accent-contrast" : "border-border-strong bg-transparent",
      )}
      data-testid={CheckboxTestId.Box}
    >
      {checked && <Icon name="check" size={checkSize[size]} stroke="bold" />}
    </span>
  );
}

/**
 * A square check control — the "pick many / on-off" sibling of {@link Toggle}.
 * Controlled only. Set `presentational` to embed the box inside another interactive
 * element (e.g. a multi-select option), where it carries no semantics of its own.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  size = "md",
  disabled = false,
  presentational = false,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  "data-testid": testId = CheckboxTestId.Root,
  ref,
}: CheckboxProps) {
  if (presentational) {
    // Visual-only: the surrounding element owns the interaction and the `checked` state.
    return (
      <span aria-hidden="true" data-testid={testId}>
        <CheckboxBox checked={checked} size={size} />
      </span>
    );
  }

  return (
    <button
      aria-checked={checked}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-2 rounded-sm",
        focusRing,
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
      data-testid={testId}
      disabled={disabled}
      id={id}
      onClick={() => onChange?.(!checked)}
      ref={ref}
      role="checkbox"
      type="button"
    >
      <CheckboxBox checked={checked} size={size} />
    </button>
  );
}
