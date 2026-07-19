import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";
import { Icon } from "../Icon/Icon";

export enum SearchInputTestId {
  Root = "search-input-root",
  Icon = "search-input-icon",
  Control = "search-input-control",
}

export interface SearchInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "type" | "size"
> {
  /** Accessible name — the control has no visible label of its own (a compact
   * icon-prefixed pill, not a labelled form field). */
  ariaLabel: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * A compact, icon-prefixed live-filter input with no visible label — the
 * "type to filter this list" sibling of `TextInputField` (always labelled) and
 * `SearchBar` (a button that opens the command palette, not an editable
 * control). Used wherever a page needs an inline free-text filter over an
 * already-loaded list, e.g. the task archive.
 */
export function SearchInput({ ariaLabel, ref, ...props }: SearchInputProps) {
  return (
    <div
      className={cn(
        "flex h-[38px] w-full items-center gap-2.5 rounded-full border border-border bg-surface px-3.5",
        "transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40",
      )}
      data-testid={SearchInputTestId.Root}
    >
      <Icon data-testid={SearchInputTestId.Icon} name="search" size="sm" tone="faint" />
      <input
        aria-label={ariaLabel}
        className="min-w-0 flex-1 border-none bg-transparent font-sans text-base text-foreground outline-none placeholder:text-foreground-faint"
        data-testid={SearchInputTestId.Control}
        ref={ref}
        type="text"
        {...props}
      />
    </div>
  );
}
