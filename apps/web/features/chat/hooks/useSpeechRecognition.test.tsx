import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installMockSpeechRecognition,
  latestRecognition,
  uninstallSpeechRecognition,
} from "../../../test/speechRecognitionMock";
import { type UseSpeechRecognitionOptions, useSpeechRecognition } from "./useSpeechRecognition";

function options(over: Partial<UseSpeechRecognitionOptions> = {}): UseSpeechRecognitionOptions {
  return { lang: "cs-CZ", onFinal: vi.fn(), onError: vi.fn(), ...over };
}

describe("useSpeechRecognition", () => {
  beforeEach(() => {
    installMockSpeechRecognition();
  });
  afterEach(() => {
    uninstallSpeechRecognition();
  });

  it("reports support when the browser exposes the API", () => {
    const { result } = renderHook(() => useSpeechRecognition(options()));
    expect(result.current.supported).toBe(true);
    expect(result.current.listening).toBe(false);
  });

  it("treats a missing API as unsupported and errors on start()", () => {
    uninstallSpeechRecognition();
    const onError = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition(options({ onError })));
    expect(result.current.supported).toBe(false);
    act(() => result.current.start());
    expect(onError).toHaveBeenCalledWith("unsupported");
  });

  it("listens on start with the configured language", () => {
    const { result } = renderHook(() => useSpeechRecognition(options({ lang: "en-US" })));
    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    expect(latestRecognition().lang).toBe("en-US");
  });

  it("hands a finalized utterance (trimmed) to onFinal and clears interim", () => {
    const onFinal = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition(options({ onFinal })));
    act(() => result.current.start());

    act(() => latestRecognition().emitResult([{ transcript: "  fix the build  ", isFinal: true }]));

    expect(onFinal).toHaveBeenCalledWith("fix the build");
    expect(result.current.interim).toBe("");
  });

  it("surfaces interim words as ghost text without finalizing", () => {
    const onFinal = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition(options({ onFinal })));
    act(() => result.current.start());

    act(() => latestRecognition().emitResult([{ transcript: "fix the", isFinal: false }]));

    expect(result.current.interim).toBe("fix the");
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("maps not-allowed to mic-denied and stops the retry loop", () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition(options({ onError })));
    act(() => result.current.start());

    act(() => latestRecognition().emitError("not-allowed"));
    expect(onError).toHaveBeenCalledWith("mic-denied");
    expect(result.current.listening).toBe(false);

    // A subsequent silent drop must NOT re-arm the recognizer.
    const rec = latestRecognition();
    const before = rec.startCount;
    act(() => rec.emitEnd());
    expect(rec.startCount).toBe(before);
  });

  it("buckets network/service faults to network and ignores no-speech", () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition(options({ onError })));
    act(() => result.current.start());

    act(() => latestRecognition().emitError("no-speech"));
    expect(onError).not.toHaveBeenCalled();

    act(() => latestRecognition().emitError("network"));
    act(() => latestRecognition().emitError("service-not-allowed"));
    expect(onError).toHaveBeenNthCalledWith(1, "network");
    expect(onError).toHaveBeenNthCalledWith(2, "network");
  });

  it("surfaces an unexpected abort while active as `aborted`", () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition(options({ onError })));
    act(() => result.current.start());
    act(() => latestRecognition().emitError("aborted"));
    expect(onError).toHaveBeenCalledWith("aborted");
  });

  it("restarts on a silent drop while active, bounded by the cap", () => {
    const { result } = renderHook(() => useSpeechRecognition(options()));
    act(() => result.current.start());
    const rec = latestRecognition();
    expect(rec.startCount).toBe(1);

    // Five consecutive silent drops each restart; the sixth is past the cap.
    for (let i = 0; i < 5; i += 1) act(() => rec.emitEnd());
    expect(rec.startCount).toBe(6);
    act(() => rec.emitEnd());
    expect(rec.startCount).toBe(6);
  });

  it("a healthy result resets the restart budget", () => {
    const { result } = renderHook(() => useSpeechRecognition(options()));
    act(() => result.current.start());
    const rec = latestRecognition();

    // Exhaust the budget to one shy of the cap (still active).
    for (let i = 0; i < 5; i += 1) act(() => rec.emitEnd());
    expect(rec.startCount).toBe(6);

    // A real result resets the counter, so the next drop restarts again.
    act(() => rec.emitResult([{ transcript: "ok", isFinal: true }]));
    act(() => rec.emitEnd());
    expect(rec.startCount).toBe(7);
  });

  it("stop() ends the session without re-arming it", () => {
    const { result } = renderHook(() => useSpeechRecognition(options()));
    act(() => result.current.start());
    const rec = latestRecognition();

    act(() => result.current.stop());

    expect(result.current.listening).toBe(false);
    // stop() fires the mock's onend, but the intentional stop cleared activeRef
    // so it must not restart.
    expect(rec.startCount).toBe(1);
  });
});
