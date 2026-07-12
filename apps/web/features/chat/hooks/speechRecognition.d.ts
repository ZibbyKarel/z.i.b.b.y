// Ambient typings for the Web Speech *recognition* API. TS 5.9's bundled
// lib.dom ships `SpeechRecognitionResult(List)` / `SpeechRecognitionAlternative`
// but NOT the `SpeechRecognition` interface itself, its result/error events, or
// the (webkit-prefixed) `Window` constructors. Declare only that missing
// surface — reusing the built-in result types so nothing is redeclared — and
// keep it fully typed (no `any`). A file with no top-level import/export is a
// global script, so `interface Window` here merges into the ambient Window.

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  /** Raw browser error code (e.g. `not-allowed`, `no-speech`, `network`). */
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
  readonly prototype: SpeechRecognition;
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
