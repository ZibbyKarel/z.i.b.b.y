import type { ReactNode } from "react";
import { createElement } from "react";
import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// jsdom ships no ResizeObserver; some richer design-system internals reference
// it on mount (mirrors the design-system setup).
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ResizeObserver as unknown as typeof globalThis.ResizeObserver;
}

// The App-Router hooks have no runtime outside Next. Stub the navigation surface
// so client components that read the router/pathname render in isolation.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/overview",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// next/link pulls in the App-Router context; render a plain anchor instead.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string | { toString(): string };
  }) =>
    createElement(
      "a",
      { href: typeof href === "string" ? href : String(href), ...props },
      children,
    ),
}));
