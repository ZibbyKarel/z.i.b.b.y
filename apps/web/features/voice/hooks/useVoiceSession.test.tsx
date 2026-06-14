import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installMockSpeechRecognition,
  latestRecognition,
  uninstallSpeechRecognition,
} from "../../../test/speechRecognitionMock";
import { useVoiceSession } from "./useVoiceSession";

describe("useVoiceSession", () => {
  afterEach(() => {
    uninstallSpeechRecognition();
  });

  describe("with recognition support", () => {
    beforeEach(() => {
      installMockSpeechRecognition();
    });

    it("defaults to live mode and drives the orb from recognition", () => {
      const { result } = renderHook(() => useVoiceSession());
      expect(result.current.mode).toBe("live");
      expect(result.current.state).toBe("idle");

      act(() => result.current.toggleMic());
      expect(result.current.isActive).toBe(true);
      expect(result.current.state).toBe("listening");

      act(() => latestRecognition().emitResult([{ transcript: "run the tests", isFinal: true }]));
      expect(result.current.transcript).toBe("run the tests");
    });

    it("can be forced to the deterministic demo even when supported", () => {
      const { result } = renderHook(() => useVoiceSession({ mode: "demo" }));
      expect(result.current.mode).toBe("demo");
      expect(result.current.transcript).toBe("");
    });
  });

  it("falls back to demo mode when recognition is unsupported", () => {
    uninstallSpeechRecognition();
    const { result } = renderHook(() => useVoiceSession());
    expect(result.current.mode).toBe("demo");
    expect(result.current.isSupported).toBe(false);
    expect(typeof result.current.toggleMic).toBe("function");
  });
});
