/**
 * A controllable stand-in for the browser's `SpeechRecognition` for jsdom tests
 * (which ship neither the standard nor the webkit-prefixed API). Install it on
 * `window` before mounting a hook/component that reads it, drive a session with
 * the `emit*` helpers, and uninstall afterwards. Mirrors the shape
 * `useSpeechRecognition` reads (the ambient `speechRecognition.d.ts` surface).
 */

interface MockResultPart {
  transcript: string;
  isFinal: boolean;
}

export class MockSpeechRecognition {
  /** Every instance constructed since the last install — newest last. */
  static instances: MockSpeechRecognition[] = [];

  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  started = false;
  /** How many times `start()` has been called (incl. silent-drop restarts). */
  startCount = 0;

  onstart: (() => void) | null = null;
  onresult: ((e: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }

  start(): void {
    if (this.started) throw new Error("already started");
    this.started = true;
    this.startCount += 1;
    this.onstart?.();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.onend?.();
  }

  abort(): void {
    this.started = false;
  }

  /** Fire a recognition result (final and/or interim chunks). */
  emitResult(parts: MockResultPart[]): void {
    const results = parts.map((p) => ({
      isFinal: p.isFinal,
      length: 1,
      item: () => ({ transcript: p.transcript, confidence: 1 }),
      0: { transcript: p.transcript, confidence: 1 },
    }));
    const event = {
      resultIndex: 0,
      results: Object.assign(results, {
        length: results.length,
        item: (i: number) => results[i],
      }),
    } as unknown as SpeechRecognitionEvent;
    this.onresult?.(event);
  }

  /** Fire a recognition error with a raw browser error code. */
  emitError(code: string): void {
    this.onerror?.({ error: code, message: "" } as unknown as SpeechRecognitionErrorEvent);
  }

  /** Fire a bare `onend` — the silent drop Chrome leaves with no error. */
  emitEnd(): void {
    this.started = false;
    this.onend?.();
  }
}

type SpeechWindow = {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};

/** Make live recognition available; returns the mock class for instance access. */
export function installMockSpeechRecognition(): typeof MockSpeechRecognition {
  MockSpeechRecognition.instances = [];
  const w = window as unknown as SpeechWindow;
  w.SpeechRecognition = MockSpeechRecognition;
  delete w.webkitSpeechRecognition;
  return MockSpeechRecognition;
}

/** Remove the recognition API — simulates an unsupported browser. */
export function uninstallSpeechRecognition(): void {
  const w = window as unknown as SpeechWindow;
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
  MockSpeechRecognition.instances = [];
}

/** The most recently constructed mock instance (throws if none yet). */
export function latestRecognition(): MockSpeechRecognition {
  const inst = MockSpeechRecognition.instances.at(-1);
  if (!inst) throw new Error("no MockSpeechRecognition instance created yet");
  return inst;
}
