import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import type { SubNavLinkComponent } from "../SubNav/SubNav";

export enum TextLinkTestId {
  Root = "text-link-root",
}

export interface TextLinkProps {
  href: string;
  children: ReactNode;
  /** Overrides the rendered anchor — pass the app's `next/link` `Link` to get
   *  client-side navigation. Defaults to a plain `<a>` (same `linkComponent`
   *  contract as `Breadcrumb`/`SubNav`/`MenuButton`/`AppHeader`). */
  linkComponent?: SubNavLinkComponent;
  /** Truncates to one line with an ellipsis instead of wrapping. */
  truncate?: boolean;
  "data-testid"?: string;
}

/**
 * An unstyled, focus-ringed text link: no underline, no baked-in color/size —
 * it inherits those from whatever it wraps (a `Typography` label, usually),
 * and only contributes the anchor semantics + a visible `focus-visible` ring.
 * For rows/lists that render their own label styling and just need a
 * navigable, keyboard-accessible wrapper around it (e.g. a sidebar row name).
 */
export function TextLink({
  href,
  children,
  linkComponent,
  truncate,
  "data-testid": testId = TextLinkTestId.Root,
}: TextLinkProps) {
  const Link = linkComponent ?? "a";
  return (
    <Link
      className={cn("rounded-sm no-underline", truncate && "block truncate", focusRing)}
      data-testid={testId}
      href={href}
    >
      {children}
    </Link>
  );
}
