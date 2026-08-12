import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { Icon } from "../Icon/Icon";

export enum SearchInputTestId {
  Root = "search-input-root",
  Icon = "search-input-icon",
  Control = "search-input-control",
  Count = "search-input-count",
}

export interface SearchInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "type" | "size"
> {
  /** Accessible name — the control has no visible label of its own (a compact
   * icon-prefixed pill, not a labelled form field). */
  ariaLabel: string;
  ref?: Ref<HTMLInputElement>;
  /** Chrome fill. "solid" (default) keeps the opaque input look; "transparent"
   * drops the own background + border so a surrounding `GlassSurface` shows
   * through instead of doubling up (mirrors `SearchBar`'s own `surface` prop). */
  surface?: "solid" | "transparent";
  /** A trailing result-count badge (mono, faint) — for a search box that
   * fronts a known total, e.g. the archive's item count. Absent renders
   * nothing (most callers have no fixed total to show). */
  count?: number | string;
}

/**
 * A compact, icon-prefixed live-filter input with no visible label — the
 * "type to filter" sibling of `TextInputField` (always labelled) and
 * `SearchBar` (a button that opens the command palette, not an editable
 * control). Used wherever a page needs an inline free-text search box, whether
 * it filters an already-loaded list or (like the task archive) drives a
 * server-side search.
 */
export function SearchInput({
  ariaLabel,
  ref,
  surface = "solid",
  count,
  ...props
}: SearchInputProps) {
  return (
    <div
      className={cn(
        "flex h-[38px] w-full items-center gap-2.5 rounded-full px-3.5 transition-colors",
        surface === "transparent"
          ? // No border/ring of its own — a surrounding `GlassSurface` already
            // draws the one visible boundary; giving this div its own focus
            // border on top doubled it up (see ChatSearch, which rings the
            // GlassSurface itself instead when open).
            "border border-transparent"
          : "border border-border bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40",
      )}
      data-testid={SearchInputTestId.Root}
    >
      <Icon data-testid={SearchInputTestId.Icon} name="search" size="sm" tone="faint" />
      <input
        aria-label={ariaLabel}
        className={cn(
          "min-w-0 flex-1 border-none bg-transparent font-sans text-base text-foreground",
          "placeholder:text-foreground-faint",
          // "solid" is already ringed by the wrapper's own focus-within style above;
          // "transparent" has no border/ring of its own, so the input must carry an
          // explicit fallback — never silently unfocusable-looking regardless of
          // whatever (if anything) wraps it.
          surface === "transparent" && focusRingInset,
        )}
        data-testid={SearchInputTestId.Control}
        ref={ref}
        type="text"
        {...props}
      />
      {count != null && (
        <span
          className="shrink-0 font-mono text-xs text-foreground-faint"
          data-testid={SearchInputTestId.Count}
        >
          {count}
        </span>
      )}
    </div>
  );
}
