import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type MockSpeechSynthesis,
  installMockSpeechSynthesis,
  uninstallSpeechSynthesis,
} from "../../../test/speechSynthesisMock";
import { setPreferredVoiceURI } from "../voicePreference";
import { useSpeech } from "./useSpeech";

describe("useSpeech", () => {
  let synth: MockSpeechSynthesis;

  beforeEach(() => {
    synth = installMockSpeechSynthesis();
  });
  afterEach(() => {
    uninstallSpeechSynthesis();
    window.localStorage.clear();
  });

  it("reports support when speechSynthesis exists", () => {
    const { result } = renderHook(() => useSpeech());
    expect(result.current.isSupported).toBe(true);
    expect(result.current.isSpeaking).toBe(false);
  });

  it("treats a missing API as unsupported and speak() is inert", () => {
    uninstallSpeechSynthesis();
    const { result } = renderHook(() => useSpeech());
    expect(result.current.isSupported).toBe(false);
    act(() => result.current.speak("ahoj", "cs-CZ"));
    // No throw, nothing spoken (the mock is gone, so this is just "doesn't crash").
    expect(result.current.isSpeaking).toBe(false);
  });

  it("resolves voices from the voiceschanged event", () => {
    const { result } = renderHook(() => useSpeech());
    act(() => synth.emitVoicesChanged());
    expect(result.current.voices.length).toBeGreaterThan(0);
  });

  it("cancels prior speech then speaks with the locale set", () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak("Schváleno.", "cs-CZ"));
    expect(synth.cancelCount).toBe(1);
    expect(synth.latest().text).toBe("Schváleno.");
    expect(synth.latest().lang).toBe("cs-CZ");
    expect(result.current.isSpeaking).toBe(true);
  });

  it("selects the local exact-locale voice", () => {
    const { result } = renderHook(() => useSpeech());
    act(() => synth.emitVoicesChanged());
    act(() => result.current.speak("Schváleno.", "cs-CZ"));
    expect(synth.latest().voice?.lang).toBe("cs-CZ");
    expect(synth.latest().voice?.localService).toBe(true);
  });

  it("clears isSpeaking when the utterance ends", () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak("done", "en-US"));
    expect(result.current.isSpeaking).toBe(true);
    act(() => synth.finishLatest());
    expect(result.current.isSpeaking).toBe(false);
  });

  it("stop() cancels in-flight speech", () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak("long line", "en-US"));
    act(() => result.current.stop());
    expect(synth.cancelCount).toBe(2); // once on speak, once on stop
    expect(result.current.isSpeaking).toBe(false);
  });

  it("ignores empty utterances", () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak("   ", "cs-CZ"));
    expect(synth.spoken).toHaveLength(0);
  });

  it("uses the operator's preferred voice over the locale match", () => {
    setPreferredVoiceURI("en-remote"); // an en-US voice, despite a cs-CZ utterance
    const { result } = renderHook(() => useSpeech());
    act(() => synth.emitVoicesChanged());
    act(() => result.current.speak("Schváleno.", "cs-CZ"));
    expect(synth.latest().voice?.voiceURI).toBe("en-remote");
  });

  it("falls back to the locale voice when the preference is unavailable", () => {
    setPreferredVoiceURI("does-not-exist");
    const { result } = renderHook(() => useSpeech());
    act(() => synth.emitVoicesChanged());
    act(() => result.current.speak("Schváleno.", "cs-CZ"));
    expect(synth.latest().voice?.voiceURI).toBe("cs-local");
  });
});
