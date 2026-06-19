# Phase 7 Voice Control — Research Report

> Operator research, 2026-06-12. Conclusion adopted by ROADMAP.md Phase 7:
> voice is built **entirely on browser-native APIs** — zero cost, no paid
> third-party voice services.

## TL;DR

Everything Phase 7 needs can be built **entirely on browser-native APIs**. No ElevenLabs, no Whisper, no paid subscription. The two pillars are `SpeechRecognition` (STT) and `speechSynthesis` (TTS), both part of the W3C Web Speech API. Wake-word detection has one strong free option (`@picovoice/porcupine-web` with a caveat) and one pure-open-source option (`@ricky0123/vad-web` for VAD, not full keyword spotting). The biggest risks are cross-browser gaps (Firefox STT is off by default, iOS is quirky) and a handful of well-documented Chrome/Safari TTS bugs with known workarounds.

---

## 1. Web Speech API — SpeechRecognition (STT)

### 1.1 Browser support matrix (2025)

| Browser                            | SpeechRecognition   | Notes                                                                                                   |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| Chrome 25+ / Edge 87+              | ✅ Full             | `window.SpeechRecognition` **and** `window.webkitSpeechRecognition` both present                        |
| Safari 14.1+ (macOS) / 14.5+ (iOS) | ✅ Partial          | `webkitSpeechRecognition` only; shows Apple permission modal ("send audio to Apple")                    |
| Firefox                            | ❌ Off by default   | Hidden behind `dom.webspeech.recognition.enable` in `about:config`; treat as unsupported                |
| Chrome 139+                        | ✅ + on-device mode | New `processLocally: true` flag; smaller model, no audio leaves device; language pack may need download |

**For ZIBBY** (self-hosted, single operator, Chromium expected): safe to target Chrome/Edge as primary. Safari is a nice-to-have. Firefox degrades gracefully to text input.

### 1.2 The network dependency problem

Chrome's default mode sends audio to Google's servers — it requires a network connection and **won't work offline**. Chrome 139 introduced `recognition.processLocally = true` for on-device processing (no audio sent anywhere, lower latency, smaller model). Check availability first:

```ts
const SpeechRecognition = window.SpeechRecognition ?? (window as any).webkitSpeechRecognition;

// Chrome 139+ on-device opt-in
if ("available" in SpeechRecognition) {
  const status = await SpeechRecognition.available({
    langs: ["cs-CZ", "en-US"],
    processLocally: true,
  });
  if (status === "downloadable") {
    await SpeechRecognition.install({ langs: ["cs-CZ", "en-US"], processLocally: true });
  }
}
```

### 1.3 Complete error code catalogue

From `SpeechRecognitionErrorEvent.error`:

| Code                     | Meaning                                         | Action                                   |
| ------------------------ | ----------------------------------------------- | ---------------------------------------- |
| `not-allowed`            | Mic permission denied or HTTPS missing          | Show "mic-denied" UI state               |
| `service-not-allowed`    | Browser blocked the STT service (CSP, iframe)   | Show "unsupported"                       |
| `network`                | Cloud STT server unreachable                    | Retry with backoff; show "network" state |
| `no-speech`              | Silence timeout — no speech detected            | Auto-restart (continuous mode)           |
| `audio-capture`          | Mic hardware not available                      | Show "mic-denied"                        |
| `language-not-supported` | `lang` attribute not supported                  | Fallback to `en-US`                      |
| `aborted`                | Stopped by user or programmatically             | Suppress; expected                       |
| `phrases-not-supported`  | Contextual biasing not available on this engine | Ignore; feature-detect                   |

### 1.4 Continuous mode + reconnection strategy

Chrome **drops the session** after ~60s of silence in continuous mode. The `onend` event fires without an error. The correct reconnect pattern:

```ts
class RecognitionSession {
  private rec: SpeechRecognition;
  private active = false;
  private retries = 0;
  private readonly MAX_RETRIES = 5;

  start() {
    this.active = true;
    this.rec.start();
  }
  stop() {
    this.active = false;
    this.rec.stop();
  }

  constructor() {
    const R = window.SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    this.rec = new R();
    this.rec.continuous = true;
    this.rec.interimResults = true;
    this.rec.lang = "cs-CZ"; // set from cookie

    this.rec.onend = () => {
      // fired on both normal stop AND silent drop — restart only if we're still "active"
      if (this.active && this.retries < this.MAX_RETRIES) {
        const delay = Math.min(200 * 2 ** this.retries, 5000);
        this.retries++;
        setTimeout(() => this.rec.start(), delay);
      }
    };
    this.rec.onerror = (e) => {
      if (e.error === "no-speech") return; // silent drop, onend fires next anyway
      if (e.error === "network") {
        /* surface network state, keep retrying */
      }
      if (e.error === "not-allowed" || e.error === "audio-capture") {
        this.active = false; // permanent; stop retrying
      }
    };
    this.rec.onresult = (e) => {
      this.retries = 0; // reset on successful recognition
      // ...
    };
  }
}
```

### 1.5 Interim vs final results

```ts
recognition.onresult = (event) => {
  let interim = "";
  let final = "";
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const t = event.results[i][0].transcript;
    if (event.results[i].isFinal) final += t;
    else interim += t;
  }
  // show interim immediately as ghost text; dispatch utterance only on final
};
```

### 1.6 Czech diacritics

Chrome's STT engine **does return proper diacritics** (háčky + čárky) for `cs-CZ`. Interim results may be without diacritics mid-phrase and gain them on final result. For command parsing, normalize both ways:

```ts
function normalizeCzech(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics for matching
    .trim();
}
// "Schválit" → "schvalit", "Odmítnout" → "odmitnout"
```

### 1.7 Contextual biasing (phrase boost) — Chrome 139+

You can boost recognition of domain-specific commands with `SpeechRecognitionPhrase`:

```ts
recognition.phrases = [
  new SpeechRecognitionPhrase("schválit", 8.0),
  new SpeechRecognitionPhrase("odmítnout", 8.0),
  new SpeechRecognitionPhrase("zastavit", 7.0),
  new SpeechRecognitionPhrase("approve", 8.0),
  new SpeechRecognitionPhrase("reject", 8.0),
];
```

Boost range 0–10, higher = more likely. This can significantly improve recognition of the grammar's specific command words.

---

## 2. SpeechSynthesis API (TTS)

### 2.1 The `getVoices()` async trap

`getVoices()` returns an empty array on first call — voices load asynchronously. The only reliable pattern:

```ts
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) {
      resolve(voices);
      return;
    }
    speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        resolve(speechSynthesis.getVoices());
      },
      { once: true },
    );
  });
}
```

In React, this belongs inside a `useEffect` — never in component body or useState initializer.

### 2.2 Voice selection strategy for Czech + English

```ts
function selectVoice(
  voices: SpeechSynthesisVoice[],
  lang: "cs-CZ" | "en-US",
): SpeechSynthesisVoice | null {
  // 1. Exact locale match, preferring local (non-remote) voices
  const exact = voices.filter((v) => v.lang === lang);
  const local = exact.find((v) => v.localService);
  if (local) return local;
  if (exact[0]) return exact[0];

  // 2. Language prefix fallback (cs-* for Czech)
  const prefix = voices.find((v) => v.lang.startsWith(lang.split("-")[0]));
  if (prefix) return prefix;

  // 3. Browser default
  return voices.find((v) => v.default) ?? voices[0] ?? null;
}
```

**Czech voice availability:**

- macOS/Safari: includes Czech system voice if installed in System Settings > Accessibility
- Chrome (with network): Google Czech voice available via cloud
- Edge on Windows 11: 250+ neural voices including Czech (`cs-CZ-VlastaNeural`, `cs-CZ-AntoninNeural`)
- Android: system-determined, cannot override

### 2.3 Production TTS bugs and workarounds

| Bug                                                                     | Browsers            | Workaround                                                                                    |
| ----------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| **Utterance GC before finish** — `onend` never fires                    | All                 | Keep a module-level reference to the utterance object                                         |
| **Autoplay blocked** — `speak()` before user gesture throws             | Chrome 71+, iOS     | Only call `speak()` inside a user event handler; queue utterances, flush on first gesture     |
| **Android voice lock** — only one system voice, no programmatic control | Android Chrome + FF | Always set `utterance.lang = voice.lang`; normalize `en_US` → `en-US` (underscore quirk)      |
| **iOS only 36 of 55 listed voices work**                                | iOS Safari          | Keep a whitelist of known-working iOS voice names                                             |
| **iOS mute switch silences TTS**                                        | iOS Safari          | No workaround; document limitation                                                            |
| **Chrome 15s silence kills synthesis on Android**                       | Android Chrome      | Re-call `speak()` with a silent utterance every 14s if queue is active (dirty but documented) |

### 2.4 `useSpeech` hook pattern (SSR-safe)

```ts
export function useSpeech() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    loadVoices().then(setVoices);
  }, []);

  const speak = useCallback(
    (text: string, lang: "cs-CZ" | "en-US" = "cs-CZ") => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel(); // stop any current speech
      const utt = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utt; // prevent GC
      utt.voice = selectVoice(voices, lang);
      utt.lang = lang;
      utt.rate = 1.1;
      utt.onend = () => {
        utteranceRef.current = null;
      };
      window.speechSynthesis.speak(utt);
    },
    [voices],
  );

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    utteranceRef.current = null;
  }, []);

  return {
    speak,
    stop,
    voices,
    supported: typeof window !== "undefined" && "speechSynthesis" in window,
  };
}
```

---

## 3. Wake Word Detection

### 3.1 Option A — Porcupine (`@picovoice/porcupine-web`) ★ Best native-ish option

**How it works:** WASM + AudioWorklet, fully on-device, no audio leaves the browser.

**Free tier caveat:** Requires a Picovoice `AccessKey` (free account). The free tier covers **up to 3 active users/month**; beyond that requires a paid plan. Devices need to "phone home" for license validation (WASM handles this). For a single-operator self-hosted system like ZIBBY, the free tier is sufficient indefinitely.

**Custom wake word:** Free to train in Picovoice Console; download a `.ppn` file for the Web/WASM platform. A "Zibby" wake word takes ~30 seconds to train.

**Next.js setup:**

```bash
pnpm add @picovoice/porcupine-react @picovoice/web-voice-processor
```

Put `porcupine_params.pv` and `zibby_en.ppn` in `/public`. Then:

```ts
import { usePorcupine } from "@picovoice/porcupine-react";

const { init, start, stop, isLoaded, isListening, keywordDetection } = usePorcupine();

useEffect(() => {
  init(process.env.NEXT_PUBLIC_PICOVOICE_KEY!, [{ publicPath: "/zibby_en.ppn", label: "zibby" }], {
    publicPath: "/porcupine_params.pv",
  });
}, []);

useEffect(() => {
  if (keywordDetection?.label === "zibby") {
    // start SpeechRecognition session
  }
}, [keywordDetection]);
```

**Limitation for ZIBBY:** The single-operator use case makes the 3-user free tier a non-issue. The `AccessKey` is an env var, not user-facing. This is the recommended path.

### 3.2 Option B — `@ricky0123/vad-web` (VAD, not keyword spotting)

**License:** MIT. Fully open-source. No API key.

**What it does:** Voice Activity Detection — fires when the user starts/stops speaking, not when they say a specific word. Use this if you want "any speech → activate" rather than "say Zibby → activate."

**How it works:** Silero VAD ONNX model via `onnxruntime-web`, AudioWorklet, fully on-device.

**Next.js config** — need to copy WASM/worklet files:

```ts
// next.config.ts
const CopyPlugin = require("copy-webpack-plugin");

export default {
  webpack(config) {
    config.plugins.push(
      new CopyPlugin({
        patterns: [
          {
            from: "node_modules/@ricky0123/vad-web/dist/*.worklet.js",
            to: "static/chunks/[name][ext]",
          },
          { from: "node_modules/@ricky0123/vad-web/dist/*.onnx", to: "static/chunks/[name][ext]" },
          { from: "node_modules/onnxruntime-web/dist/*.wasm", to: "static/chunks/[name][ext]" },
        ],
      }),
    );
    return config;
  },
};
```

```ts
import { useMicVAD } from "@ricky0123/vad-react";

const vad = useMicVAD({
  startOnLoad: true,
  onSpeechStart: () => {
    /* activate STT */
  },
  onSpeechEnd: (audio) => {
    /* audio segment available */
  },
  baseAssetPath: "/_next/static/chunks/",
  onnxWASMBasePath: "/_next/static/chunks/",
});
```

**Recommendation for ZIBBY:** Use Porcupine for wake-word ("Zibby"), VAD as a fallback/alternative for simple "tap to activate" UX.

### 3.3 Option C — openWakeWord

**Not viable for in-browser use.** Python only; browser usage requires a WebSocket Python backend. License issue: pre-trained models are CC BY-NC-SA (non-commercial). Skip.

---

## 4. Testing Strategy (Vitest + jsdom)

Both APIs are absent from jsdom — you must stub them manually. The key insight is that the hook tests need to fire synthetic events on the mock object.

### 4.1 SpeechRecognition mock

```ts
// test/mocks/speechRecognition.ts
export class MockSpeechRecognition extends EventTarget {
  continuous = false;
  interimResults = false;
  lang = "";
  phrases: unknown[] = [];

  start = vi.fn(() => {
    this.dispatchEvent(new Event("start"));
  });
  stop = vi.fn(() => {
    this.dispatchEvent(new Event("end"));
  });
  abort = vi.fn(() => {
    this.dispatchEvent(new Event("end"));
  });

  // test helpers
  simulateFinalResult(transcript: string, confidence = 0.95) {
    const event = Object.assign(new Event("result"), {
      resultIndex: 0,
      results: [
        {
          0: { transcript, confidence },
          isFinal: true,
          length: 1,
        },
      ],
    });
    this.dispatchEvent(event);
  }

  simulateError(error: string) {
    const event = Object.assign(new Event("error"), { error, message: "" });
    this.dispatchEvent(event);
  }
}

// in vitest.setup.ts:
Object.defineProperty(window, "SpeechRecognition", {
  value: MockSpeechRecognition,
  writable: true,
});
```

### 4.2 SpeechSynthesis mock

```ts
// test/mocks/speechSynthesis.ts
const mockVoices: SpeechSynthesisVoice[] = [
  {
    name: "Google Czech",
    lang: "cs-CZ",
    default: true,
    localService: false,
    voiceURI: "Google Czech",
  } as SpeechSynthesisVoice,
  {
    name: "Google US English",
    lang: "en-US",
    default: false,
    localService: false,
    voiceURI: "Google US English",
  } as SpeechSynthesisVoice,
];

const mockSpeechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: vi.fn(() => mockVoices),
  speaking: false,
  pending: false,
  paused: false,
  onvoiceschanged: null as EventListener | null,
};

Object.defineProperty(window, "speechSynthesis", {
  value: mockSpeechSynthesis,
  writable: true,
});
```

### 4.3 Example hook test

```ts
// useSpeechRecognition.test.ts
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSpeechRecognition } from "../useSpeechRecognition";

describe("useSpeechRecognition", () => {
  let mockInstance: MockSpeechRecognition;

  beforeEach(() => {
    vi.spyOn(window, "SpeechRecognition").mockImplementation(() => {
      mockInstance = new MockSpeechRecognition();
      return mockInstance;
    });
  });

  it("transitions to listening state on start", () => {
    const { result } = renderHook(() => useSpeechRecognition({ lang: "cs-CZ" }));
    act(() => result.current.startListening());
    expect(result.current.isListening).toBe(true);
  });

  it("sets transcript on final result", async () => {
    const onFinal = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ lang: "cs-CZ", onFinal }));
    act(() => result.current.startListening());
    act(() => mockInstance.simulateFinalResult("schválit"));
    expect(onFinal).toHaveBeenCalledWith("schválit");
  });

  it("maps not-allowed error to mic-denied state", () => {
    const { result } = renderHook(() => useSpeechRecognition({ lang: "cs-CZ" }));
    act(() => result.current.startListening());
    act(() => mockInstance.simulateError("not-allowed"));
    expect(result.current.error).toBe("mic-denied");
    expect(result.current.isListening).toBe(false);
  });

  it("retries on no-speech error in continuous mode", async () => {
    const { result } = renderHook(() => useSpeechRecognition({ lang: "cs-CZ", continuous: true }));
    act(() => result.current.startListening());
    act(() => {
      mockInstance.simulateError("no-speech");
      mockInstance.dispatchEvent(new Event("end"));
    });
    // after debounce, start should be called again
    await vi.runAllTimersAsync();
    expect(mockInstance.start).toHaveBeenCalledTimes(2);
  });
});
```

---

## 5. Architecture — Hook Design

### 5.1 `useSpeechRecognition`

```ts
export type SpeechRecognitionError =
  | "mic-denied" // not-allowed | audio-capture
  | "unsupported" // no SpeechRecognition in window
  | "network" // network error
  | "service-denied"; // service-not-allowed

export interface UseSpeechRecognitionOptions {
  lang?: string; // from locale cookie
  continuous?: boolean;
  mode?: "live" | "demo"; // demo uses the existing useVoiceDemoSequence
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: SpeechRecognitionError) => void;
}

export interface UseSpeechRecognitionResult {
  isListening: boolean;
  isSupported: boolean;
  transcript: string; // latest interim
  error: SpeechRecognitionError | null;
  startListening: () => void;
  stopListening: () => void;
}
```

**SSR guard pattern:**

```ts
const isSupported =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
```

### 5.2 `useSpeech` (TTS)

```ts
export interface UseSpeechResult {
  speak: (text: string, lang?: string) => void;
  stop: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
  voices: SpeechSynthesisVoice[];
}
```

### 5.3 `VoiceSession` interface extension (from Roadmap 7.1)

```ts
export interface VoiceSession {
  mode: "live" | "demo";
  isListening: boolean;
  isSpeaking: boolean;
  isSupported: boolean;
  error: SpeechRecognitionError | null;
  transcript: string; // current interim
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  stop: () => void;
}
```

---

## 6. `dispatchUtterance` Grammar

The grammar in `dispatchUtterance.ts` should normalize before matching. Suggested grammar table covering Phase 7.2:

| Czech (normalized)             | English (normalized) | Action                  |
| ------------------------------ | -------------------- | ----------------------- |
| `schval` / `schvalit`          | `approve`            | `approveLatest`         |
| `odmit` / `odmitnout`          | `reject` / `deny`    | `rejectLatest`          |
| `zastav` / `zastavit` / `stop` | `stop`               | `stopActive`            |
| `jdi na {page}`                | `navigate to {page}` | `navigate(page)`        |
| `zavrit` / `zavrít`            | `close`              | `closeOverlay`          |
| anything else                  | anything else        | `createTask(utterance)` |

```ts
const COMMANDS: Array<{ patterns: RegExp[]; action: () => VoiceAction }> = [
  {
    patterns: [/^schval(it)?$/, /^approve$/],
    action: () => ({ type: "approveLatest" }),
  },
  {
    patterns: [/^odm[ií]t(nout)?$/, /^(reject|deny)$/],
    action: () => ({ type: "rejectLatest" }),
  },
  // ...
];

export function parseUtterance(raw: string, lang: "cs" | "en"): VoiceAction {
  const normalized = normalizeCzech(raw); // strip diacritics, lowercase
  for (const cmd of COMMANDS) {
    if (cmd.patterns.some((p) => p.test(normalized))) return cmd.action();
  }
  return { type: "createTask", text: raw }; // preserve original for task text
}
```

---

## 7. Accessibility

- Voice overlay: use the native `<dialog>` element — built-in focus trap, `Escape` to close, correct ARIA semantics. Or `role="dialog"` + `aria-modal="true"` + manual focus trap.
- STT status: `<div role="status" aria-live="polite">` for interim transcript display.
- Errors: `<div role="alert" aria-live="assertive">` for error states.
- Always provide keyboard/text fallback — Phase 7.2 explicitly requires it (`text-input fallback when speech is unavailable`).
- `aria-label="Voice control active"` on the mic button when listening.
- The voice overlay should restore focus to the trigger element on close.

---

## 8. Key Gotchas Summary

| Risk                                                    | Mitigation                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Chrome STT requires network (default)                   | Use `processLocally: true` in Chrome 139+ as opt-in; `network` error state in hook      |
| `onend` fires on both `stop()` AND silent session drop  | Use `active` boolean flag — only restart if the session was supposed to be running      |
| `getVoices()` returns `[]` on first call                | Always use `voiceschanged` listener; resolve promise `{ once: true }`                   |
| iOS: only 36/55 listed voices work                      | Whitelist known-working voice names for iOS                                             |
| Android: `utterance.lang` must be set explicitly        | Always set `utt.lang = voice.lang` with underscore normalization                        |
| Utterance GC before `onend`                             | Keep module-level ref to `SpeechSynthesisUtterance`                                     |
| `speak()` before user gesture blocked                   | Queue utterances, flush on first user interaction                                       |
| Porcupine free tier: 3 users/month                      | For single-operator ZIBBY, non-issue; AccessKey via `NEXT_PUBLIC_PICOVOICE_KEY` env var |
| WASM/worklet files need webpack copy config for VAD     | Use `copy-webpack-plugin` in `next.config.ts`                                           |
| SSR: `window` is undefined in Next.js server components | Guard every Speech API access with `typeof window !== 'undefined'`                      |
| Firefox: SpeechRecognition off by default               | `isSupported` check → render text-input fallback automatically                          |

---

## 9. Recommended Implementation Order for Phase 7

1. **7.1a** — `useSpeechRecognition` hook (mode: live | demo, error states, reconnect, interim/final) + Vitest mocks
2. **7.1b** — `useSpeech` hook (TTS, `voiceschanged`, voice selection, GC-safe utterance ref) + tests
3. **7.2a** — `parseUtterance` + grammar (cs + en, diacritics normalization) + comprehensive unit tests
4. **7.2b** — Wire `dispatchUtterance` to real mutations; read outcomes/approvals aloud via `useSpeech`
5. **7.3a** — Voice overlay a11y: `<dialog>`, `aria-live`, focus trap, keyboard fallback
6. **7.3b** (optional) — Porcupine wake word: train "Zibby" `.ppn`, add `usePorcupine` wrapper
7. **7.3c** — Settings > Voice surface (lang, TTS voice picker, wake-word toggle)

---

## Sources

- [Web Speech API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [SpeechRecognitionErrorEvent.error — MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionErrorEvent/error)
- [Using the Web Speech API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
- [Speech Recognition API | Can I Use](https://caniuse.com/speech-recognition)
- [A Deep Dive into the Web Speech API — AddPipe](https://blog.addpipe.com/a-deep-dive-into-the-web-speech-api/)
- [Lessons Learned Using SpeechSynthesis API — TalkrApp](https://talkrapp.com/speechSynthesis.html)
- [On-Device Speech UIs in Chrome 139 — Medium](https://medium.com/@roman_fedyskyi/on-device-speech-uis-in-chrome-139-4b9f0397b9c9)
- [Porcupine Wake Word — Picovoice](https://picovoice.ai/platform/porcupine/)
- [Wake Word Detection with Next.js — Picovoice Blog](https://picovoice.ai/blog/wake-word-detection-with-nextjs/)
- [@picovoice/porcupine-web — npm](https://www.npmjs.com/package/@picovoice/porcupine-web)
- [@ricky0123/vad-web — Voice Activity Detection](https://www.vad.ricky0123.com/)
- [openWakeWord — GitHub](https://github.com/dscripka/openWakeWord)
- [SpeechRecognition: continuous property — MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/continuous)
- [Speech Synthesis API Browser Support — TestMu AI](https://www.testmuai.com/learning-hub/speech-synthesis-api-browser-support/)
- [Recommended Web Speech Voices — GitHub](https://github.com/HadrienGardeur/web-speech-recommended-voices)
