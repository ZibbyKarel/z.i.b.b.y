/**
 * A controllable stand-in for the browser's `speechSynthesis` + `SpeechSynthesisUtterance`
 * for jsdom tests (which ship neither). Install it before mounting a hook/component that
 * speaks, drive utterance lifecycle with the helpers, and uninstall afterwards.
 */

export class MockSpeechSynthesisUtterance {
  text: string;
  lang = "";
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

export class MockSpeechSynthesis {
  /** Every utterance passed to speak(), newest last. */
  spoken: MockSpeechSynthesisUtterance[] = [];
  cancelCount = 0;
  speaking = false;
  private voices: SpeechSynthesisVoice[];
  private listeners: Array<() => void> = [];

  constructor(voices: SpeechSynthesisVoice[]) {
    this.voices = voices;
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  speak(utt: MockSpeechSynthesisUtterance) {
    this.spoken.push(utt);
    this.speaking = true;
    utt.onstart?.();
  }

  cancel() {
    this.cancelCount += 1;
    this.speaking = false;
  }

  addEventListener(type: string, cb: () => void) {
    if (type === "voiceschanged") this.listeners.push(cb);
  }

  removeEventListener(type: string, cb: () => void) {
    if (type === "voiceschanged") {
      this.listeners = this.listeners.filter((l) => l !== cb);
    }
  }

  /** Fire `voiceschanged` (voices become available asynchronously in real browsers). */
  emitVoicesChanged() {
    for (const l of this.listeners) l();
  }

  /** The most recent utterance (throws if none). */
  latest(): MockSpeechSynthesisUtterance {
    const u = this.spoken.at(-1);
    if (!u) throw new Error("no utterance spoken yet");
    return u;
  }

  /** Complete the current utterance — fires onend, clears speaking. */
  finishLatest() {
    this.speaking = false;
    this.latest().onend?.();
  }
}

/** A tiny voice fixture: a local Czech voice, a remote English one, plus a default. */
export function fixtureVoices(): SpeechSynthesisVoice[] {
  return [
    {
      name: "Czech (local)",
      lang: "cs-CZ",
      localService: true,
      default: false,
      voiceURI: "cs-local",
    },
    {
      name: "Google US English",
      lang: "en-US",
      localService: false,
      default: true,
      voiceURI: "en-remote",
    },
    { name: "English (UK)", lang: "en-GB", localService: true, default: false, voiceURI: "en-gb" },
  ] as SpeechSynthesisVoice[];
}

interface SpeechWindow {
  speechSynthesis?: unknown;
  SpeechSynthesisUtterance?: unknown;
}

/** Make TTS available; returns the synthesis mock for assertions. */
export function installMockSpeechSynthesis(
  voices: SpeechSynthesisVoice[] = fixtureVoices(),
): MockSpeechSynthesis {
  const synth = new MockSpeechSynthesis(voices);
  const w = window as unknown as SpeechWindow;
  w.speechSynthesis = synth;
  w.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
  return synth;
}

/** Remove the TTS API — simulates an unsupported browser. */
export function uninstallSpeechSynthesis() {
  const w = window as unknown as SpeechWindow;
  delete w.speechSynthesis;
  delete w.SpeechSynthesisUtterance;
}
