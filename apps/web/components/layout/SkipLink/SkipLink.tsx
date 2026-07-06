export enum SkipLinkTestId {
  Root = "skip-link-root",
}

export interface SkipLinkProps {
  /** Visible (on focus) link text, already translated by the caller. */
  label: string;
  /** id of the landmark to jump to (without the leading `#`). */
  targetId: string;
}

/**
 * First focusable element in the app shell: invisible until it receives
 * keyboard focus, then jumps a keyboard user straight to the `<main>`
 * landmark, skipping the nav rail. Layout chrome, not a DS primitive — mirrors
 * MainLayout/TopBar/Sidebar living in apps/web/components/layout.
 */
export function SkipLink({ label, targetId }: SkipLinkProps) {
  return (
    <a
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded focus:bg-[var(--color-accent)] focus:px-4 focus:py-2 focus:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2"
      data-testid={SkipLinkTestId.Root}
      href={`#${targetId}`}
    >
      {label}
    </a>
  );
}
