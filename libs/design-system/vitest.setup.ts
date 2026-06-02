import "@testing-library/jest-dom/vitest"

// jsdom ships no ResizeObserver; some richer components (e.g. the Markdown
// editor's autosizing internals) reference it on mount.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ResizeObserver as unknown as typeof globalThis.ResizeObserver
}
