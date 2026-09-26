import type { ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";

export enum FilterBarTestId {
  Root = "filter-bar-root",
  Clear = "filter-bar-clear",
  Actions = "filter-bar-actions",
}

export interface FilterBarProps {
  /** Filter controls — a `SelectField`, `SegmentedControl`, `SearchInput`, etc.,
   * each already paired with its own label by the caller. */
  children: ReactNode;
  /** Shown as a trailing "CLEAR FILTERS" button when given. */
  onClear?: () => void;
  /** Right-aligned slot for non-filter controls (e.g. a "New task" button). */
  actions?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * DS.md §8 filter row — a wrap-flex line of filter groups (Work/Runs/Log/
 * People screens), flush to the baseline of their controls, ending in an
 * optional "CLEAR FILTERS" button and a right-aligned actions slot.
 */
export function FilterBar({ children, onClear, actions, ref }: FilterBarProps) {
  return (
    <div
      className="flex flex-wrap items-end gap-[18px]"
      data-testid={FilterBarTestId.Root}
      ref={ref}
    >
      {children}
      {onClear && (
        <button
          className={cn(
            "box-border flex h-8 items-center border border-border-strong px-[10px]",
            "font-mono text-[10px] tracking-wider text-foreground-secondary",
            "hover:bg-elevated hover:text-foreground",
            focusRing,
          )}
          data-testid={FilterBarTestId.Clear}
          onClick={onClear}
          type="button"
        >
          Clear filters
        </button>
      )}
      {actions && (
        <div className="ml-auto flex items-center gap-2" data-testid={FilterBarTestId.Actions}>
          {actions}
        </div>
      )}
    </div>
  );
}
