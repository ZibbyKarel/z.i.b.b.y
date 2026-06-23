/**
 * Minimal `EventSource` test double. jsdom ships no `EventSource`, so streaming
 * hooks (`useChatStream`, the run-log tail) no-op in tests unless one is installed
 * on `globalThis`. This records every constructed instance and exposes an `emit`
 * helper to drive `onmessage`/`onerror`/`onopen` synchronously from a test.
 *
 * Usage:
 *   const mock = installEventSourceMock();
 *   // …render the component that opens the stream…
 *   mock.last().emit({ type: "delta", text: "Hi", turnId: "t1", conversationId: "c1" });
 *   mock.restore();
 */
export class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onopen: ((event: unknown) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  /** Push a JSON-serialisable payload through `onmessage` (mirrors an SSE frame). */
  emit(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  /** Fire the `onerror` handler (e.g. to simulate a dropped connection). */
  emitError(): void {
    this.onerror?.(new Event("error"));
  }

  /** Fire the `onopen` handler. */
  emitOpen(): void {
    this.onopen?.(new Event("open"));
  }

  close(): void {
    this.closed = true;
  }
}

interface InstalledEventSourceMock {
  /** The most recently constructed instance (the one under test). */
  last: () => MockEventSource;
  /** All constructed instances, in order. */
  instances: () => MockEventSource[];
  /** Restore the previous global `EventSource` (or remove the stub). */
  restore: () => void;
}

/**
 * Install {@link MockEventSource} as the global `EventSource` and clear any
 * previously recorded instances. Returns helpers to reach the live instance and to
 * restore the prior global afterward.
 */
export function installEventSourceMock(): InstalledEventSourceMock {
  MockEventSource.instances = [];
  const previous = (globalThis as { EventSource?: unknown }).EventSource;
  (globalThis as { EventSource?: unknown }).EventSource =
    MockEventSource as unknown as typeof EventSource;

  return {
    last: () => {
      const inst = MockEventSource.instances.at(-1);
      if (!inst) throw new Error("No MockEventSource has been constructed yet");
      return inst;
    },
    instances: () => MockEventSource.instances,
    restore: () => {
      (globalThis as { EventSource?: unknown }).EventSource = previous;
      MockEventSource.instances = [];
    },
  };
}
