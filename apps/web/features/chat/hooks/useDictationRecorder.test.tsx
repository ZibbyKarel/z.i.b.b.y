import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDictationRecorder } from "./useDictationRecorder";

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("../mutations", () => ({ useTranscribeSpeechMutation: () => ({ mutateAsync }) }));

const started = { current: 0 };
const ctorOptions: unknown[] = [];
let ctorThrows = false;

class FakeRecorder {
  static isTypeSupported = () => true;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, options: unknown) {
    if (ctorThrows) throw new Error("bad options");
    ctorOptions.push(options);
  }
  start() {
    started.current++;
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])]) });
    this.onstop?.();
  }
}

const trackStop = vi.fn();
const getUserMedia = vi.fn();

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function setup() {
  const onFinal = vi.fn();
  const onError = vi.fn();
  const hook = renderHook(() => useDictationRecorder({ lang: "cs-CZ", onFinal, onError }));
  return { ...hook, onFinal, onError };
}

describe("useDictationRecorder", () => {
  beforeEach(() => {
    started.current = 0;
    ctorOptions.length = 0;
    ctorThrows = false;
    mutateAsync.mockReset();
    trackStop.mockReset();
    getUserMedia.mockReset();
    getUserMedia.mockImplementation(async () => ({ getTracks: () => [{ stop: trackStop }] }));
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  async function record(result: { current: ReturnType<typeof useDictationRecorder> }, n: number) {
    act(() => result.current.start());
    await waitFor(() => expect(started.current).toBe(n));
  }

  it("records, transcribes on stop and hands the text to onFinal", async () => {
    mutateAsync.mockResolvedValue({ status: 200, body: { text: " ahoj " } });
    const { result, onFinal } = setup();
    expect(result.current.supported).toBe(true);

    await record(result, 1);
    expect(ctorOptions[0]).toMatchObject({ audioBitsPerSecond: 32000 });
    act(() => result.current.stop());
    await waitFor(() => expect(onFinal).toHaveBeenCalledWith("ahoj"));
    expect(mutateAsync.mock.calls[0]?.[0]).toEqual({
      body: { audioBase64: "AQID", mimeType: "audio/webm;codecs=opus", language: "cs" },
    });
    await waitFor(() => expect(result.current.state).toBe("idle"));
    expect(trackStop).toHaveBeenCalled();
  });

  it("still delivers the transcript when recording restarts during transcription", async () => {
    const d = deferred<unknown>();
    mutateAsync.mockReturnValue(d.promise);
    const { result, onFinal } = setup();

    await record(result, 1);
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.state).toBe("transcribing"));
    await record(result, 2); // ChatDock `suspended` cycle: stop → transcribe → start
    expect(result.current.state).toBe("recording");

    await act(async () => d.resolve({ status: 200, body: { text: "první" } }));
    expect(onFinal).toHaveBeenCalledWith("první");
    expect(result.current.state).toBe("recording");
  });

  it("stop() while already transcribing neither sticks nor loses the text", async () => {
    const d = deferred<unknown>();
    mutateAsync.mockReturnValue(d.promise);
    const { result, onFinal } = setup();

    await record(result, 1);
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.state).toBe("transcribing"));
    act(() => result.current.stop());
    expect(result.current.state).toBe("transcribing");

    await act(async () => d.resolve({ status: 200, body: { text: "text" } }));
    expect(onFinal).toHaveBeenCalledWith("text");
    await waitFor(() => expect(result.current.state).toBe("idle"));
  });

  it("reports a transcription failure and returns to idle", async () => {
    mutateAsync.mockRejectedValue(new Error("503"));
    const { result, onError } = setup();
    await record(result, 1);
    act(() => result.current.stop());
    await waitFor(() => expect(onError).toHaveBeenCalledWith("network"));
    await waitFor(() => expect(result.current.state).toBe("idle"));
  });

  it("auto-stops and transcribes at the length cap", async () => {
    mutateAsync.mockResolvedValue({ status: 200, body: { text: "dlouhé" } });
    const timeouts: Array<[() => void, number | undefined]> = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
      if (ms === 180_000) {
        timeouts.push([fn, ms]);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return realSetTimeout(fn, ms);
    }) as typeof setTimeout);
    const { result, onFinal } = setup();
    await record(result, 1);
    expect(timeouts).toHaveLength(1);
    act(() => timeouts[0]?.[0]());
    await waitFor(() => expect(onFinal).toHaveBeenCalledWith("dlouhé"));
    vi.restoreAllMocks();
  });

  it("maps a denied microphone to mic-denied", async () => {
    getUserMedia.mockRejectedValue(new DOMException("no", "NotAllowedError"));
    const { result, onError } = setup();
    act(() => result.current.start());
    await waitFor(() => expect(onError).toHaveBeenCalledWith("mic-denied"));
    expect(result.current.state).toBe("idle");
  });

  it("releases the mic when MediaRecorder cannot be created", async () => {
    ctorThrows = true;
    const { result, onError } = setup();
    act(() => result.current.start());
    await waitFor(() => expect(onError).toHaveBeenCalledWith("network"));
    expect(trackStop).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });
});
