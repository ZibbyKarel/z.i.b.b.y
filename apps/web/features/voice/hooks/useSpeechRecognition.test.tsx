import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installMockSpeechRecognition,
  latestRecognition,
  uninstallSpeechRecognition,
} from "../../../test/speechRecognitionMock";
import { useSpeechRecognition } from "./useSpeechRecognition";

describe("useSpeechRecognition", () => {
  beforeEach(() => {
    installMockSpeechRecognition();
  });
  afterEach(() => {
    uninstallSpeechRecognition();
  });

  it("reports support when the browser exposes the API", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(true);
    expect(result.current.isListening).toBe(false);
  });

  it("treats a missing API as unsupported and errors on start", () => {
    uninstallSpeechRecognition();
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(false);
    act(() => result.current.start());
    expect(result.current.error).toBe("unsupported");
  });

  it("listens on start and surfaces a finalized transcript", () => {
    const { result } = renderHook(() => useSpeechRecognition({ lang: "cs-CZ" }));
    act(() => result.current.start());
    expect(result.current.isListening).toBe(true);
    expect(latestRecognition().lang).toBe("cs-CZ");

    act(() => latestRecognition().emitResult([{ transcript: "fix the build", isFinal: true }]));
    expect(result.current.transcript).toBe("fix the build");
    expect(result.current.interim).toBe("");
  });

  it("surfaces interim words as ghost text without finalizing", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    act(() => latestRecognition().emitResult([{ transcript: "fix the", isFinal: false }]));
    expect(result.current.interim).toBe("fix the");
    expect(result.current.transcript).toBe("");
  });

  it("maps not-allowed to mic-denied and stops the retry loop", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    act(() => latestRecognition().emitError("not-allowed"));
    expect(result.current.error).toBe("mic-denied");

    // A subsequent silent drop must NOT re-arm the recognizer.
    const rec = latestRecognition();
    const before = rec.startCount;
    act(() => rec.emitEnd());
    expect(rec.startCount).toBe(before);
  });

  it("maps network and service errors to their codes; ignores no-speech", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());

    act(() => latestRecognition().emitError("no-speech"));
    expect(result.current.error).toBeNull();

    act(() => latestRecognition().emitError("network"));
    expect(result.current.error).toBe("network");

    act(() => latestRecognition().emitError("service-not-allowed"));
    expect(result.current.error).toBe("service-denied");
  });

  it("restarts on a silent drop while active, bounded by the cap", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const rec = latestRecognition();
    expect(rec.startCount).toBe(1);

    // Five consecutive silent drops restart; the sixth is past the cap.
    for (let i = 0; i < 5; i += 1) act(() => rec.emitEnd());
    expect(rec.startCount).toBe(6);
    act(() => rec.emitEnd());
    expect(rec.startCount).toBe(6);
  });

  it("a real result resets the restart budget", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const rec = latestRecognition();

    for (let i = 0; i < 5; i += 1) act(() => rec.emitEnd());
    expect(rec.startCount).toBe(6);
    // A healthy result resets the counter, so drops restart again.
    act(() => rec.emitResult([{ transcript: "ok", isFinal: true }]));
    act(() => rec.emitEnd());
    expect(rec.startCount).toBe(7);
  });

  it("stop() ends the session without re-arming it", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => result.current.start());
    const rec = latestRecognition();
    act(() => result.current.stop());
    expect(result.current.isListening).toBe(false);
    expect(rec.startCount).toBe(1);
  });
});
