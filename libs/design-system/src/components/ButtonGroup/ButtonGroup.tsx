import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Stack } from "../Stack/Stack";
import { Icon } from "../Icon/Icon";

export enum ButtonGroupTestId {
  Root = "button-group-root",
  /** Each option button is suffixed with its `id`, e.g. `button-group-option-home`. */
  Option = "button-group-option",
  /** Leading slot of an option, suffixed with its `id`, e.g. `button-group-leading-home`. */
  Leading = "button-group-leading",
  /** Trailing slot of an option, suffixed with its `id`, e.g. `button-group-trailing-home`. */
  Trailing = "button-group-trailing",
  Add = "button-group-add",
}

export type ButtonGroupTone = "accent" | "ok" | "warn" | "bad";

const toneSwatch: Record<ButtonGroupTone, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
};

const toneActive: Record<ButtonGroupTone, string> = {
  accent: "bg-accent text-accent-contrast",
  ok: "bg-ok text-accent-contrast",
  warn: "bg-warn text-accent-contrast",
  bad: "bg-bad text-accent-contrast",
};

export interface ButtonGroupOption {
  id: string;
  label: string;
  /** Semantic colour for the swatch + active state, resolved inside the DS. */
  tone?: ButtonGroupTone;
  /** Arbitrary content rendered before the label (icon, status dot, …). */
  leading?: ReactNode;
  /** Arbitrary content rendered after the label (count, badge, …). */
  trailing?: ReactNode;
}

export interface ButtonGroupProps {
  options: ButtonGroupOption[];
  /** The active option `id`, or `""` for no selection. */
  value: string;
  /** Fires with the clicked option `id`, or `""` when the active option is
   *  toggled off (only possible when `deselectable`). */
  onChange: (value: string) => void;
  /** Allow clicking the active option to clear the selection (emits `""`). */
  deselectable?: boolean;
  onAdd?: () => void;
  /** Accessible label for the add-option affordance. */
  addLabel?: string;
  /** Accessible label for the group element. */
  ariaLabel?: string;
}

/** Generic segmented button group — a row of mutually exclusive toggle buttons. */
export function ButtonGroup({
  options,
  value,
  onChange,
  deselectable = false,
  onAdd,
  addLabel = "Přidat",
  ariaLabel,
}: ButtonGroupProps) {
  return (
    <div
      aria-label={ariaLabel}
      className="inline-block rounded border border-border bg-background p-0.5"
      data-testid={ButtonGroupTestId.Root}
      role="group"
    >
      <Stack inline align="center" direction="row" gap="25">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-2 rounded-sm border-none px-3 py-1.5 font-mono text-base font-semibold transition-all",
              focusRing,
              active
                ? (o.tone ? toneActive[o.tone] : "bg-accent text-accent-contrast")
                : "bg-transparent text-foreground-dim hover:text-foreground",
            )}
            data-testid={`${ButtonGroupTestId.Option}-${o.id}`}
            key={o.id}
            onClick={() => onChange(deselectable && active ? "" : o.id)}
            type="button"
          >
            {o.leading && (
              <span
                className="inline-flex items-center"
                data-testid={`${ButtonGroupTestId.Leading}-${o.id}`}
              >
                {o.leading}
              </span>
            )}
            {o.tone && (
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  active ? "bg-background opacity-70" : toneSwatch[o.tone],
                )}
              />
            )}
            {o.label}
            {o.trailing && (
              <span
                className="inline-flex items-center"
                data-testid={`${ButtonGroupTestId.Trailing}-${o.id}`}
              >
                {o.trailing}
              </span>
            )}
          </button>
        );
      })}
      {onAdd && (
        <button
          aria-label={addLabel}
          className={cn(
            "flex px-2 py-1.5 text-foreground-faint hover:text-foreground",
            focusRing,
          )}
          data-testid={ButtonGroupTestId.Add}
          onClick={onAdd}
          type="button"
        >
          <Icon name="plus" size="sm" />
        </button>
      )}
      </Stack>
    </div>
  );
}
