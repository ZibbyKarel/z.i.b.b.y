import type { AnchorHTMLAttributes } from "react";
import type { Route } from "next";
import Link from "next/link";

type AnchorProps = { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

/**
 * Adapts `next/link` (which types `href` as `Route`) to the DS's router-agnostic
 * `linkComponent` contract (`href: string`) — same seam as `AppShell`'s `NavLink`.
 */
export function NavLink({ href, ...rest }: AnchorProps) {
  return <Link href={href as Route} {...rest} />;
}

/** `linkComponent` for links leaving the app (Jira / GitHub): a new tab, no opener. */
export function ExternalAnchor({ href, ...rest }: AnchorProps) {
  return <a href={href} rel="noopener noreferrer" target="_blank" {...rest} />;
}
