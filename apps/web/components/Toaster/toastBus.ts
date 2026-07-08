/** The two outcomes a toast conveys — a green confirmation or a red failure.
 * Absent (the `MutationCache` path) is treated as `"error"` by the Toaster. */
export type ToastSeverity = "ok" | "error";

export interface Toast {
  id: number;
  /** Custom copy; when absent the Toaster renders the localized mutation-error message. */
  message?: string;
  /** Visual tone; defaults to `"error"` at render (preserves the MutationCache behavior). */
  severity?: ToastSeverity;
}

type Listener = (toast: Toast) => void;

const listeners = new Set<Listener>();
// Monotonic counter — `Date.now()` / `Math.random()` are banned in this codebase.
let nextId = 1;

/**
 * A minimal module-level toast pub/sub. The non-React `QueryClient` `MutationCache`
 * `onError` callback `emit()`s here; the `<Toaster>` subscribes and renders. Decouples
 * the cache callback (outside React, no i18n) from the React toast surface.
 */
export const toastBus = {
  emit(toast: { message?: string; severity?: ToastSeverity } = {}): void {
    const t: Toast = { id: nextId++, message: toast.message, severity: toast.severity };
    for (const l of listeners) l(t);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
