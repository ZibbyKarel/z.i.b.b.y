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

// Node 25 exposes an experimental global `localStorage` that throws without a
// `--localstorage-file`, shadowing jsdom's working Storage. Install a minimal
// in-memory Storage so client preferences (caffeinate, voice) are testable.
if (typeof window.localStorage?.setItem !== "function") {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? (store.get(k) ?? null) : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: memoryStorage,
  });
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
