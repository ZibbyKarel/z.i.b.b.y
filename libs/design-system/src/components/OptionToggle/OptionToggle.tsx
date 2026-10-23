import type { Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";

export enum OptionToggleTestId {
  Root = "option-toggle-root",
  /** Each option button is suffixed with its `id`, e.g. `option-toggle-option-auto`. */
  Option = "option-toggle-option",
}

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
              "rounded-sm border-none px-[10px] py-[4px] font-sans text-[12px] font-medium transition-colors",
              !readOnly && focusRing,
              active ? "bg-raised text-ink shadow-card" : "bg-transparent text-foreground-faint",
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
