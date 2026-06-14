/**
 * A controllable stand-in for the browser's `SpeechRecognition` for jsdom tests
 * (which ship neither the standard nor the webkit-prefixed API). Install it on
 * `window` before mounting a hook/component that reads it, drive a session with
 * the `emit*` helpers, and uninstall afterwards.
 */

interface MockResultPart {
  transcript: string;
  isFinal: boolean;
}
interface MockResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface MockErrorEvent {
  error: string;
}

export class MockSpeechRecognition {
  /** Every instance constructed since the last install — newest last. */
  static instances: MockSpeechRecognition[] = [];

  lang = "";
  continuous = false;
  interimResults = false;
  started = false;
  /** How many times `start()` has been called (incl. silent-drop restarts). */
  startCount = 0;

  onstart: (() => void) | null = null;
  onresult: ((e: MockResultEvent) => void) | null = null;
  onerror: ((e: MockErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }

  start() {
    if (this.started) throw new Error("already started");
    this.started = true;
    this.startCount += 1;
    this.onstart?.();
  }
  stop() {
    if (!this.started) return;
    this.started = false;
    this.onend?.();
  }
  abort() {
    this.started = false;
  }

  /** Fire a recognition result (final and/or interim chunks). */
  emitResult(parts: MockResultPart[]) {
    const results = parts.map((p) => ({
      isFinal: p.isFinal,
      0: { transcript: p.transcript },
    }));
    this.onresult?.({ resultIndex: 0, results });
  }
  /** Fire a recognition error with a raw browser error code. */
  emitError(code: string) {
    this.onerror?.({ error: code });
  }
  /** Fire a bare `onend` — the silent-drop Chrome leaves with no error. */
  emitEnd() {
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
export function uninstallSpeechRecognition() {
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
