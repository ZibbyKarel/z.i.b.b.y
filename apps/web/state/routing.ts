/** Appends the current ?ctx= param to a href so context survives navigation. */
export function hrefWithCtx(href: string, ctx: string): string {
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${ctx !== "home" ? `${sep}ctx=${ctx}` : ""}`;
}
