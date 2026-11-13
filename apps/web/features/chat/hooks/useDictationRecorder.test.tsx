import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDictationRecorder } from "./useDictationRecorder";

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("../mutations", () => ({ useTranscribeSpeechMutation: () => ({ mutateAsync }) }));

const started = { current: 0 };
const startArgs: unknown[] = [];
const instances: FakeRecorder[] = [];
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
    instances.push(this);
  }
  start(timeslice?: number) {
    startArgs.push(timeslice);
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
    startArgs.length = 0;
    instances.length = 0;
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

  describe("interim", () => {
    const chunk = (n: number) => ({ data: new Blob([new Uint8Array(n)]) });

    it("starts MediaRecorder with a 2s timeslice", async () => {
      const { result } = setup();
      await record(result, 1);
      expect(startArgs[0]).toBe(2000);
    });

    it("surfaces the cumulative transcript as interim while recording", async () => {
      const d = deferred<unknown>();
      mutateAsync.mockReturnValueOnce(d.promise).mockReturnValue(new Promise(() => {}));
      const { result } = setup();
      await record(result, 1);
      const rec = instances[0]!;
      rec.state = "recording";
      act(() => rec.ondataavailable?.(chunk(3)));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      await act(async () => d.resolve({ status: 200, body: { text: " ahoj " } }));
      await waitFor(() => expect(result.current.interim).toBe("ahoj"));
      expect(result.current.state).toBe("recording");

      act(() => rec.ondataavailable?.(chunk(4)));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
      expect(mutateAsync.mock.calls[1]?.[0].body).toMatchObject({
        audioBase64: btoa(String.fromCharCode(...new Uint8Array(7))),
        language: "cs",
      });
    });

    it("sends at most one interim request at a time", async () => {
      mutateAsync.mockReturnValue(new Promise(() => {}));
      const { result } = setup();
      await record(result, 1);
      const rec = instances[0]!;
      act(() => {
        rec.ondataavailable?.(chunk(1));
        rec.ondataavailable?.(chunk(1));
      });
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 20));
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    });

    it("drops an interim result that lands after stop", async () => {
      const d = deferred<unknown>();
      mutateAsync
        .mockReturnValueOnce(d.promise)
        .mockResolvedValue({ status: 200, body: { text: "" } });
      const { result } = setup();
      await record(result, 1);
      act(() => instances[0]!.ondataavailable?.(chunk(2)));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      act(() => result.current.stop());
      await act(async () => d.resolve({ status: 200, body: { text: "late" } }));
      expect(result.current.interim).toBe("");
    });

    it("does not call onError when an interim request fails", async () => {
      mutateAsync.mockRejectedValue(new Error("503"));
      const { result, onError } = setup();
      await record(result, 1);
      act(() => instances[0]!.ondataavailable?.(chunk(2)));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 20));
      expect(onError).not.toHaveBeenCalled();
      expect(result.current.state).toBe("recording");
    });

    it("stop then start: the new recording sends its own interim while the old one is pending", async () => {
      const old = deferred<unknown>();
      mutateAsync.mockReturnValueOnce(old.promise).mockReturnValue(new Promise(() => {}));
      const { result } = setup();
      await record(result, 1);
      act(() => instances[0]!.ondataavailable?.(chunk(2)));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      act(() => result.current.stop());
      await record(result, 2);
      const rec2 = instances[1]!;
      act(() => {
        rec2.ondataavailable?.(chunk(2));
        rec2.ondataavailable?.(chunk(2));
      });
      // rec1's final clip (on stop) + rec2's first interim request
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(3));
      await act(async () => old.resolve({ status: 200, body: { text: "old" } }));
      act(() => rec2.ondataavailable?.(chunk(2)));
      await new Promise((r) => setTimeout(r, 20));
      expect(mutateAsync).toHaveBeenCalledTimes(3); // still one in flight for rec2
      expect(result.current.interim).toBe("");
    });

    it("resets interim to empty when a new recording starts", async () => {
      mutateAsync.mockResolvedValue({ status: 200, body: { text: "ahoj" } });
      const { result } = setup();
      await record(result, 1);
      act(() => instances[0]!.ondataavailable?.(chunk(2)));
      await waitFor(() => expect(result.current.interim).toBe("ahoj"));
      mutateAsync.mockReturnValue(new Promise(() => {}));
      act(() => result.current.stop());
      expect(result.current.interim).toBe("ahoj"); // kept until the final lands
      await record(result, 2);
      expect(result.current.interim).toBe("");
    });

    it("keeps the last interim while transcribing and clears it when the final lands", async () => {
      const fin = deferred<unknown>();
      mutateAsync
        .mockResolvedValueOnce({ status: 200, body: { text: "ahoj" } })
        .mockReturnValueOnce(fin.promise);
      const { result, onFinal } = setup();
      await record(result, 1);
      act(() => instances[0]!.ondataavailable?.(chunk(2)));
      await waitFor(() => expect(result.current.interim).toBe("ahoj"));
      act(() => result.current.stop());
      await waitFor(() => expect(result.current.state).toBe("transcribing"));
      expect(result.current.interim).toBe("ahoj");
      await act(async () => fin.resolve({ status: 200, body: { text: "ahoj světe" } }));
      expect(onFinal).toHaveBeenCalledWith("ahoj světe");
      expect(result.current.interim).toBe("");
    });

    it("clears the interim when the final transcription fails", async () => {
      mutateAsync
        .mockResolvedValueOnce({ status: 200, body: { text: "ahoj" } })
        .mockRejectedValueOnce(new Error("503"));
      const { result, onError } = setup();
      await record(result, 1);
      act(() => instances[0]!.ondataavailable?.(chunk(2)));
      await waitFor(() => expect(result.current.interim).toBe("ahoj"));
      act(() => result.current.stop());
      await waitFor(() => expect(onError).toHaveBeenCalledWith("network"));
      await waitFor(() => expect(result.current.interim).toBe(""));
    });
  });
});
