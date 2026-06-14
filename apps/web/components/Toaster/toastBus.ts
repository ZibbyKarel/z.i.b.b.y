export interface Toast {
  id: number;
  /** Custom copy; when absent the Toaster renders the localized mutation-error message. */
  message?: string;
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
  emit(toast: { message?: string } = {}): void {
    const t: Toast = { id: nextId++, message: toast.message };
    for (const l of listeners) l(t);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
