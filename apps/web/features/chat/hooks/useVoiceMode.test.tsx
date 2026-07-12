import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastBus } from "../../../components/Toaster/toastBus";
import messages from "../../../i18n/messages/cs.json";
import {
  installMockSpeechRecognition,
  latestRecognition,
  uninstallSpeechRecognition,
} from "../../../test/speechRecognitionMock";
import { useVoiceMode } from "./useVoiceMode";

// The hook reads `chat.voice.*` toast copy via `useTranslations`, so the wrapper
// carries the real cs catalog (same as `renderWithProviders`).
function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="cs" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("useVoiceMode", () => {
  let toastEmit: MockInstance;

  beforeEach(() => {
    installMockSpeechRecognition();
    toastEmit = vi.spyOn(toastBus, "emit");
  });
  afterEach(() => {
    uninstallSpeechRecognition();
    vi.restoreAllMocks();
  });

  it("reports support and starts inactive", () => {
    const { result } = renderHook(() => useVoiceMode({ onSend: vi.fn() }), { wrapper });
    expect(result.current.supported).toBe(true);
    expect(result.current.active).toBe(false);
    expect(result.current.listening).toBe(false);
  });

  it("reports no support when the browser lacks the API", () => {
    uninstallSpeechRecognition();
    const { result } = renderHook(() => useVoiceMode({ onSend: vi.fn() }), { wrapper });
    expect(result.current.supported).toBe(false);
  });

  it("toggling on arms the mic; toggling off stops it without re-arming", () => {
    const { result } = renderHook(() => useVoiceMode({ onSend: vi.fn() }), { wrapper });

    act(() => result.current.toggle());
    expect(result.current.active).toBe(true);
    expect(result.current.listening).toBe(true);
    const rec = latestRecognition();
    expect(rec.startCount).toBe(1);

    act(() => result.current.toggle());
    expect(result.current.active).toBe(false);
    expect(result.current.listening).toBe(false);
    // Intentional stop must not restart the recognizer.
    expect(rec.startCount).toBe(1);
  });

  it("sends a finalized utterance as a chat message, trimmed", () => {
    const onSend = vi.fn();
    const { result } = renderHook(() => useVoiceMode({ onSend }), { wrapper });

    act(() => result.current.toggle());
    act(() => latestRecognition().emitResult([{ transcript: "  spusť build  ", isFinal: true }]));

    expect(onSend).toHaveBeenCalledWith("spusť build");
  });

  it("drops voice mode and toasts the mic-denied copy when the browser blocks the mic", () => {
    const { result } = renderHook(() => useVoiceMode({ onSend: vi.fn() }), { wrapper });

    act(() => result.current.toggle());
    expect(result.current.active).toBe(true);

    act(() => latestRecognition().emitError("not-allowed"));

    expect(result.current.active).toBe(false);
    expect(result.current.listening).toBe(false);
    expect(toastEmit).toHaveBeenCalledTimes(1);
    expect(toastEmit).toHaveBeenCalledWith({
      message: "Prohlížeč zablokoval přístup k mikrofonu — povolte ho v nastavení stránky.",
    });
  });

  it("drops voice mode and toasts the generic voice-fault copy on other faults", () => {
    const { result } = renderHook(() => useVoiceMode({ onSend: vi.fn() }), { wrapper });

    act(() => result.current.toggle());
    act(() => latestRecognition().emitError("network"));

    expect(result.current.active).toBe(false);
    expect(toastEmit).toHaveBeenCalledTimes(1);
    expect(toastEmit).toHaveBeenCalledWith({
      message: "Rozpoznávání řeči selhalo, hlasový režim je vypnutý.",
    });
  });

  describe("turn-taking suspension (Phase 119d)", () => {
    it("disarms the mic while suspended and re-arms when it clears, staying on throughout", () => {
      const { result, rerender } = renderHook(
        ({ suspended }) => useVoiceMode({ onSend: vi.fn(), suspended }),
        { wrapper, initialProps: { suspended: false } },
      );

      act(() => result.current.toggle());
      const rec = latestRecognition();
      expect(result.current.listening).toBe(true);
      expect(rec.startCount).toBe(1);

      // A turn goes in flight / a reply speaks → suspend: the mic stops, but voice
      // mode stays ON (this is the paused strip state, not a toggle-off).
      rerender({ suspended: true });
      expect(rec.started).toBe(false);
      expect(result.current.listening).toBe(false);
      expect(result.current.active).toBe(true);

      // The reply settled → suspend clears → the same recognizer re-arms (a fresh
      // start on the state transition, never a timer).
      rerender({ suspended: false });
      expect(rec.started).toBe(true);
      expect(rec.startCount).toBe(2);
      expect(result.current.listening).toBe(true);
    });

    it("never arms while suspended, even after toggling voice mode on", () => {
      const { result } = renderHook(
        ({ suspended }) => useVoiceMode({ onSend: vi.fn(), suspended }),
        { wrapper, initialProps: { suspended: true } },
      );

      act(() => result.current.toggle());
      expect(result.current.active).toBe(true);
      // The recognizer is built on mount but never started while suspended.
      expect(result.current.listening).toBe(false);
      expect(latestRecognition().started).toBe(false);
      expect(latestRecognition().startCount).toBe(0);
    });
  });

  it("stops the mic when it unmounts (leaving /chat)", () => {
    const { result, unmount } = renderHook(() => useVoiceMode({ onSend: vi.fn() }), { wrapper });
    act(() => result.current.toggle());
    const rec = latestRecognition();
    expect(rec.started).toBe(true);

    unmount();

    // The active session is aborted on teardown — nothing keeps listening.
    expect(rec.started).toBe(false);
  });
});
