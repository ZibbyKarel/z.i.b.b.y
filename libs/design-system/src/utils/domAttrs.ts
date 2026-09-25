import { cn } from "./cn";

/**
 * Pre-composed `{ className }` bags for the few `apps/web` spots that render a
 * raw/framework element the design system has no matching prop (or component)
 * for yet — a `next/link` `Link` (DS doesn't depend on Next.js) or a
 * responsive breakpoint no `Container`/`Stack` prop expresses. Spread these
 * (`{...iconDockLinkAttrs}`) rather than typing a literal `className=` JSX
 * attribute, which apps/web's D-007 lint wall bans outright — the Tailwind
 * string itself is still authored here, in the design system, never in
 * `apps/web`.
 */

/** The chat top-right tool dock's icon-only nav links (`ChatToolDock`). */
export const iconDockLinkAttrs = {
  className: cn(
    "grid size-[38px] place-items-center rounded-[12px] text-foreground-dim outline-none",
    "transition-colors hover:text-accent focus-visible:text-accent",
  ),
};

/** `ImmersivePage`'s round back-button `Link` (temporary — deleted in ZB-13). */
export const immersiveBackLinkAttrs = {
  className: cn(
    "flex size-full items-center justify-center text-foreground-dim outline-none",
    "transition-colors hover:text-accent focus-visible:text-accent",
  ),
};

/** `hidden lg:flex` — Chat's left tasks gutter, hidden below the `lg` breakpoint. */
export const hiddenBelowLgFlexAttrs = { className: "hidden lg:flex" };

/** next/font CSS-module variable class names for the root `<html>` element —
 *  not Tailwind, but still a literal `className=` JSX attribute apps/web can't
 *  type directly; routed through this DS-owned function instead. */
export function htmlFontAttrs(...fontVariableClasses: string[]) {
  return { className: cn(...fontVariableClasses) };
}
