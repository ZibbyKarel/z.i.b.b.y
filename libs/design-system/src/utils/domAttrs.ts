import { cn } from "./cn";

/**
 * Pre-composed `{ className }` bags for the few `apps/web` spots that render a
 * raw/framework element the design system has no matching prop (or component)
 * for yet — a `next/link` `Link` (DS doesn't depend on Next.js) or a
 * responsive breakpoint no `Container`/`Stack` prop expresses. Spread these
 * (`{...htmlFontAttrs(…)}`) rather than typing a literal `className=` JSX
 * attribute, which apps/web's D-007 lint wall bans outright — the Tailwind
 * string itself is still authored here, in the design system, never in
 * `apps/web`.
 */

/** next/font CSS-module variable class names for the root `<html>` element —
 *  not Tailwind, but still a literal `className=` JSX attribute apps/web can't
 *  type directly; routed through this DS-owned function instead. */
export function htmlFontAttrs(...fontVariableClasses: string[]) {
  return { className: cn(...fontVariableClasses) };
}
