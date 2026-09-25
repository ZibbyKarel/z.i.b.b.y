import type { Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRingOffset } from "../../utils/focus";

export enum SkipLinkTestId {
  Root = "skip-link-root",
}

export interface SkipLinkProps {
  /** Visible (on focus) link text. English default per DS i18n convention —
   *  the app overrides with its own translation. */
  label?: string;
  /** id of the landmark to jump to (without the leading `#`). */
  targetId: string;
  ref?: Ref<HTMLAnchorElement>;
}

/**
 * The first focusable element in the app shell — invisible until it receives
 * keyboard focus, then jumps straight to the `<main>` landmark, skipping the
 * header/nav chrome. `AppFrame` already builds one of these in internally;
 * this standalone export exists only so `apps/web`'s pre-`AppFrame` mount
 * (`components/layout/SkipLink`) has a DS replacement until ZB-01 wires
 * `AppFrame` in and that app file is deleted.
 */
export function SkipLink({ label = "Skip to main content", targetId, ref }: SkipLinkProps) {
  return (
    <a
      className={cn(
        "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]",
        "focus:border focus:border-ink focus:bg-panel focus:px-4 focus:py-2",
        "focus:font-mono focus:text-[11px] focus:uppercase focus:tracking-wider focus:text-ink",
        focusRingOffset,
      )}
      data-testid={SkipLinkTestId.Root}
      href={`#${targetId}`}
      ref={ref}
    >
      {label}
    </a>
  );
}
