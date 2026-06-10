import type { Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Icon } from "../Icon/Icon";
import { Kbd } from "../Kbd/Kbd";

export enum SearchBarTestId {
  Root = "searchbar-root",
  Icon = "searchbar-icon",
  Placeholder = "searchbar-placeholder",
  Shortcut = "searchbar-shortcut",
}

export interface SearchBarProps {
  /** Prompt text shown inside the bar (acts as placeholder). */
  placeholder: string;
  /** Accessible label — the bar is a button that opens a command palette. */
  ariaLabel: string;
  /** Optional keyboard-shortcut hint rendered as a `<kbd>` on the trailing edge. */
  shortcut?: string;
  /** Native tooltip text. */
  title?: string;
  onClick?: () => void;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * The dashboard command / search bar. A wide, quiet button styled like an input
 * that opens the command palette on click (or via its keyboard shortcut). Sizing
 * is fluid — it fills its container, so callers control the width via layout.
 */
export function SearchBar({
  placeholder,
  ariaLabel,
  shortcut,
  title,
  onClick,
  ref,
}: SearchBarProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-2.5 w-full px-3.5 py-2 cursor-pointer",
        "bg-background border border-border rounded-sm text-foreground-faint",
        "transition-colors",
        "hover:border-border-strong hover:text-foreground-dim",
        focusRing,
      )}
      data-testid={SearchBarTestId.Root}
      onClick={onClick}
      ref={ref}
      title={title}
      type="button"
    >
      <Icon data-testid={SearchBarTestId.Icon} name="search" size="sm" />
      <span
        className="flex-1 min-w-0 text-left text-base truncate"
        data-testid={SearchBarTestId.Placeholder}
      >
        {placeholder}
      </span>
      {shortcut ? <Kbd data-testid={SearchBarTestId.Shortcut}>{shortcut}</Kbd> : null}
    </button>
  );
}
