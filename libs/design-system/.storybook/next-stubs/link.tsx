import { type ReactNode, createElement } from "react";

/**
 * Storybook stub for `next/link`. The App-Router context isn't mounted under the
 * react-vite builder, so the real Link throws. Rendering a plain anchor keeps the
 * app-layout stories (Sidebar, MainLayout, AppShell) working in Storybook.
 */
export default function Link({
  children,
  href,
  ...props
}: {
  children: ReactNode;
  href: string | { toString(): string };
}) {
  return createElement(
    "a",
    { href: typeof href === "string" ? href : String(href), ...props },
    children,
  );
}
