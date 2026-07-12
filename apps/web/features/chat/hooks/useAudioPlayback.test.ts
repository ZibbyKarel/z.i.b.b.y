import { act, renderHook } from "@testing-library/react";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastBus } from "../../../components/Toaster/toastBus";
import {
  getPlayingKey,
  playAudioPlayback,
  stopAudioPlayback,
  useAudioPlayback,
  wavBase64ToBlob,
} from "./useAudioPlayback";

/** jsdom implements neither a working `Audio`/`HTMLMediaElement.play()` nor
 * `URL.createObjectURL` — stub both so the module's browser calls are inert
 * and observable. */
class FakeAudio {
  static instances: FakeAudio[] = [];
  /** When true, the next constructed instance's `play()` rejects (autoplay
   * block / undecodable source — the promise-rejection failure path). */
  static rejectPlay = false;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  playCalls = 0;
  private readonly rejectPlay = FakeAudio.rejectPlay;

  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }

  play(): Promise<void> {
    this.playCalls += 1;
    return this.rejectPlay ? Promise.reject(new Error("NotSupportedError")) : Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }
}

describe("useAudioPlayback", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let toastEmit: MockInstance;
  let nextUrl = 0;

  beforeEach(() => {
    FakeAudio.instances = [];
    FakeAudio.rejectPlay = false;
    toastEmit = vi.spyOn(toastBus, "emit");
    nextUrl = 0;
    createObjectURL = vi.fn(() => `blob:mock-${nextUrl++}`);
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    vi.stubGlobal("Audio", FakeAudio);
  });

  afterEach(() => {
    stopAudioPlayback();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("decodes a base64 payload into an audio/wav Blob with the right bytes", () => {
    // jsdom's Blob has no working `.text()`/`.arrayBuffer()`, so assert on
    // what it was constructed with instead of reading it back.
    let capturedParts: BlobPart[] = [];
    let capturedType: string | undefined;
    class SpyBlob {
      size: number;
      type: string;
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        capturedParts = parts;
        capturedType = options?.type;
        this.size = (parts[0] as Uint8Array).length;
        this.type = options?.type ?? "";
      }
    }
    vi.stubGlobal("Blob", SpyBlob);

    // "hello" base64-encoded.
    const blob = wavBase64ToBlob("aGVsbG8=");

    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(5);
    expect(capturedType).toBe("audio/wav");
    const bytes = capturedParts[0] as Uint8Array;
    expect(String.fromCharCode(...bytes)).toBe("hello");
  });

  it("plays under the given key and reports playing state to that key's hook", () => {
    const { result } = renderHook(() => useAudioPlayback("msg-1"));
    expect(result.current.isPlaying).toBe(false);

    act(() => result.current.play("aGVsbG8="));

    expect(result.current.isPlaying).toBe(true);
    expect(getPlayingKey()).toBe("msg-1");
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]?.playCalls).toBe(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("starting a second play stops the first (single-player invariant) and revokes its URL", () => {
    const a = renderHook(() => useAudioPlayback("a"));
    const b = renderHook(() => useAudioPlayback("b"));

    act(() => a.result.current.play("aGVsbG8="));
    const firstAudio = FakeAudio.instances[0]!;
    expect(a.result.current.isPlaying).toBe(true);

    act(() => b.result.current.play("d29ybGQ="));

    expect(firstAudio.paused).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-0");
    expect(getPlayingKey()).toBe("b");
    expect(b.result.current.isPlaying).toBe(true);
    // `a`'s hook re-renders (via useSyncExternalStore) and sees it's no longer playing.
    a.rerender();
    expect(a.result.current.isPlaying).toBe(false);
  });

  it("stop() is a no-op when this key isn't the one playing", () => {
    const { result } = renderHook(() => useAudioPlayback("solo"));
    act(() => result.current.stop());
    expect(getPlayingKey()).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("stop() halts playback and clears state for the playing key", () => {
    const { result } = renderHook(() => useAudioPlayback("solo"));
    act(() => result.current.play("aGVsbG8="));
    const audio = FakeAudio.instances[0]!;

    act(() => result.current.stop());

    expect(audio.paused).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-0");
    expect(getPlayingKey()).toBeNull();
    expect(result.current.isPlaying).toBe(false);
  });

  it("clears state when the audio element fires ended — with no error toast", () => {
    const { result } = renderHook(() => useAudioPlayback("solo"));
    act(() => result.current.play("aGVsbG8="));
    const audio = FakeAudio.instances[0]!;

    act(() => audio.onended?.());

    expect(getPlayingKey()).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(toastEmit).not.toHaveBeenCalled();
  });

  it("surfaces a rejected play() as an error toast and still tears down once", async () => {
    FakeAudio.rejectPlay = true;
    const { result } = renderHook(() => useAudioPlayback("solo"));

    // Async: the rejection lands in a microtask after play() is called.
    await act(async () => {
      result.current.play("aGVsbG8=");
    });

    expect(getPlayingKey()).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-0");
    expect(toastEmit).toHaveBeenCalledTimes(1);
  });

  it("surfaces a decode failure (the element's error event) as an error toast", () => {
    const { result } = renderHook(() => useAudioPlayback("solo"));
    act(() => result.current.play("aGVsbG8="));
    const audio = FakeAudio.instances[0]!;

    act(() => audio.onerror?.());

    expect(getPlayingKey()).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(toastEmit).toHaveBeenCalledTimes(1);
  });

  it("toasts and revokes at most once when both failure signals fire for the same instance", async () => {
    FakeAudio.rejectPlay = true;
    const { result } = renderHook(() => useAudioPlayback("solo"));

    await act(async () => {
      result.current.play("aGVsbG8=");
    });
    const audio = FakeAudio.instances[0]!;
    // A real corrupt source can both reject play() AND fire `error`.
    act(() => audio.onerror?.());

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(toastEmit).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale ended callback from an instance already superseded", () => {
    const { result } = renderHook(() => useAudioPlayback("solo"));
    act(() => playAudioPlayback("solo", "aGVsbG8="));
    const staleAudio = FakeAudio.instances[0]!;

    act(() => playAudioPlayback("solo", "d29ybGQ="));
    revokeObjectURL.mockClear();

    // The stale instance's own `ended` firing after it was superseded must not
    // tear down the NEW instance's state.
    act(() => staleAudio.onended?.());

    expect(getPlayingKey()).toBe("solo");
    expect(result.current.isPlaying).toBe(true);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
