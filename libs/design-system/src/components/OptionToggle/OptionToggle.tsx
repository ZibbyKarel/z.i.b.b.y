import type { Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";

export enum OptionToggleTestId {
  Root = "option-toggle-root",
  /** Each option button is suffixed with its `id`, e.g. `option-toggle-option-auto`. */
  Option = "option-toggle-option",
}

export type OptionToggleSize = "md" | "lg";
/** `primary` — the active segment wears the primary-button colours. */
export type OptionToggleIntent = "default" | "primary";

const sizeClass: Record<OptionToggleSize, string> = {
  md: "px-[10px] py-[4px] text-[12px]",
  lg: "px-5 py-2 text-[13px]",
};
const activeClass: Record<OptionToggleIntent, string> = {
  default: "bg-raised text-ink shadow-card",
  primary: "border border-accent bg-accent text-accent-contrast",
};

export interface OptionToggleOption<T extends string = string> {
  id: T;
  label: string;
}

export interface OptionToggleProps<T extends string = string> {
  options: OptionToggleOption<T>[];
  /** The selected option `id`. */
  value: T;
  /** Omit to render a read-only display of the current value (e.g. a resolved
   *  setting annotated on a detail page vs. the editor's live control). */
  onChange?: (value: T) => void;
  /** Accessible label for the group. */
  ariaLabel?: string;
  size?: OptionToggleSize;
  intent?: OptionToggleIntent;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A compact pick-one pill (e.g. a gate's `Auto` ⇄ `Ask` ⇄ `Silent`) — the same
 * visual editable or read-only. Shares the segmented-control look (rounded frame,
 * raised active segment). Each option is an independently-focusable toggle
 * button (mirroring `ButtonGroup`'s `aria-pressed` pattern), not a
 * roving-tabindex radiogroup.
 */
export function OptionToggle<T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  intent = "default",
  ref,
}: OptionToggleProps<T>) {
  const readOnly = !onChange;
  return (
    <div
      aria-label={ariaLabel}
      className="inline-flex w-fit gap-0.5 rounded-md border border-line-2 bg-panel p-0.5"
      data-testid={OptionToggleTestId.Root}
      ref={ref}
      role="group"
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            aria-disabled={readOnly || undefined}
            aria-pressed={readOnly ? undefined : active}
            className={cn(
              "rounded-sm font-sans font-medium transition-colors",
              sizeClass[size],
              !(active && intent === "primary") && "border-none",
              !readOnly && focusRing,
              active ? activeClass[intent] : "bg-transparent text-foreground-faint",
              !readOnly && !active && "cursor-pointer hover:text-foreground",
              readOnly && "cursor-default",
            )}
            data-testid={`${OptionToggleTestId.Option}-${o.id}`}
            disabled={readOnly}
            key={o.id}
            onClick={() => onChange?.(o.id)}
            type="button"
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
