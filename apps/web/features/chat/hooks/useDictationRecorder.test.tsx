import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installEventSourceMock } from "../../../test/eventSourceMock";
import { useDictationRecorder } from "./useDictationRecorder";

const mutateAsync = vi.hoisted(() => vi.fn());
const startAsync = vi.hoisted(() => vi.fn());
const finishAsync = vi.hoisted(() => vi.fn());
vi.mock("../mutations", () => ({
  useTranscribeSpeechMutation: () => ({ mutateAsync }),
  useStartDictationMutation: () => ({ mutateAsync: startAsync }),
  useFinishDictationMutation: () => ({ mutateAsync: finishAsync }),
}));
const fetchMock = vi.fn();
let sse: ReturnType<typeof installEventSourceMock>;

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
    startAsync.mockReset();
    finishAsync.mockReset();
    fetchMock.mockReset();
    // Default: the stream cannot start, so the one-shot path runs (the tests below
    // that exercise streaming override this).
    startAsync.mockRejectedValue(new Error("503"));
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);
    sse = installEventSourceMock();
    trackStop.mockReset();
    getUserMedia.mockReset();
    getUserMedia.mockImplementation(async () => ({ getTracks: () => [{ stop: trackStop }] }));
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
  });
  afterEach(() => {
    sse.restore();
    vi.unstubAllGlobals();
  });

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

  describe("streaming", () => {
    const chunk = (n: number) => ({ data: new Blob([new Uint8Array(n).fill(n)]) });
    const session = (id = "s1") => ({ status: 201, body: { id } });
    const uploadedSizes = () =>
      Promise.all(fetchMock.mock.calls.map(([, init]) => (init.body as Blob).size));

    it("starts MediaRecorder with a 250ms timeslice", async () => {
      const { result } = setup();
      await record(result, 1);
      expect(startArgs[0]).toBe(250);
    });

    it("uploads chunks in order, one at a time, to the session", async () => {
      startAsync.mockResolvedValue(session());
      const gates = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>()];
      gates.forEach((g) => fetchMock.mockReturnValueOnce(g.promise));
      const { result } = setup();
      await record(result, 1);
      act(() => {
        instances[0]!.ondataavailable?.(chunk(1));
        instances[0]!.ondataavailable?.(chunk(2));
        instances[0]!.ondataavailable?.(chunk(3));
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 20));
      expect(fetchMock).toHaveBeenCalledTimes(1); // second waits for the first
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toMatch(/\/api\/speech\/dictation\/s1\/audio$/);
      expect(init.method).toBe("POST");
      expect(init.headers["content-type"]).toBe("application/octet-stream");
      await act(async () => gates[0]!.resolve({ ok: true }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await act(async () => gates[1]!.resolve({ ok: true }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
      expect(await uploadedSizes()).toEqual([1, 2, 3]);
      await act(async () => gates[2]!.resolve({ ok: true }));
    });

    it("queues chunks recorded before the session id arrives, then flushes them in order", async () => {
      const d = deferred<unknown>();
      startAsync.mockReturnValue(d.promise);
      const { result } = setup();
      await record(result, 1);
      act(() => {
        instances[0]!.ondataavailable?.(chunk(1));
        instances[0]!.ondataavailable?.(chunk(2));
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(sse.instances()).toHaveLength(0);
      await act(async () => d.resolve(session("late")));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(await uploadedSizes()).toEqual([1, 2]);
      expect(fetchMock.mock.calls[0]?.[0]).toMatch(/dictation\/late\/audio$/);
      expect(sse.last().url).toMatch(/dictation\/late\/events$/);
    });

    it("SSE updates drive interim", async () => {
      startAsync.mockResolvedValue(session());
      const { result } = setup();
      await record(result, 1);
      await waitFor(() => expect(sse.instances()).toHaveLength(1));
      act(() => sse.last().emit({ text: " ahoj ", final: false }));
      expect(result.current.interim).toBe("ahoj");
      act(() => sse.last().emit({ text: "ahoj světe", final: false }));
      expect(result.current.interim).toBe("ahoj světe");
      expect(result.current.state).toBe("recording");
    });

    it("stop → finish → onFinal once with the finish text; interim kept until then", async () => {
      startAsync.mockResolvedValue(session());
      const fin = deferred<unknown>();
      finishAsync.mockReturnValue(fin.promise);
      const { result, onFinal } = setup();
      await record(result, 1);
      await waitFor(() => expect(sse.instances()).toHaveLength(1));
      act(() => sse.last().emit({ text: "ahoj", final: false }));
      act(() => result.current.stop());
      await waitFor(() => expect(result.current.state).toBe("transcribing"));
      await waitFor(() => expect(finishAsync).toHaveBeenCalledTimes(1));
      expect(result.current.interim).toBe("ahoj");
      expect(finishAsync.mock.calls[0]?.[0]).toMatchObject({ params: { id: "s1" } });
      await act(async () => fin.resolve({ status: 200, body: { text: " ahoj světe " } }));
      await waitFor(() => expect(result.current.state).toBe("idle"));
      expect(onFinal).toHaveBeenCalledTimes(1);
      expect(onFinal).toHaveBeenCalledWith("ahoj světe");
      expect(result.current.interim).toBe("");
      expect(mutateAsync).not.toHaveBeenCalled();
      expect(sse.last().closed).toBe(true);
    });

    it("finish waits for the upload queue to drain", async () => {
      startAsync.mockResolvedValue(session());
      const up = deferred<unknown>();
      fetchMock.mockReturnValueOnce(up.promise);
      finishAsync.mockResolvedValue({ status: 200, body: { text: "x" } });
      const { result, onFinal } = setup();
      await record(result, 1);
      act(() => instances[0]!.ondataavailable?.(chunk(1)));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      act(() => result.current.stop()); // FakeRecorder emits a last chunk too
      await new Promise((r) => setTimeout(r, 20));
      expect(finishAsync).not.toHaveBeenCalled();
      await act(async () => up.resolve({ ok: true }));
      await waitFor(() => expect(onFinal).toHaveBeenCalledWith("x"));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    describe("fallback to the one-shot transcription", () => {
      beforeEach(() => mutateAsync.mockResolvedValue({ status: 200, body: { text: "záloha" } }));

      async function expectOneShot(result: { current: ReturnType<typeof useDictationRecorder> }) {
        act(() => result.current.stop());
        await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
        expect(mutateAsync.mock.calls[0]?.[0].body).toMatchObject({
          mimeType: "audio/webm;codecs=opus",
          language: "cs",
        });
        await waitFor(() => expect(result.current.state).toBe("idle"));
      }

      it("when the session cannot start", async () => {
        startAsync.mockResolvedValue({ status: 503, body: { message: "no" } });
        const { result, onFinal, onError } = setup();
        await record(result, 1);
        await expectOneShot(result);
        expect(onFinal).toHaveBeenCalledTimes(1);
        expect(onFinal).toHaveBeenCalledWith("záloha");
        expect(onError).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(finishAsync).not.toHaveBeenCalled();
      });

      it("when a chunk upload fails", async () => {
        startAsync.mockResolvedValue(session());
        fetchMock.mockResolvedValue({ ok: false, status: 404 });
        const { result, onFinal } = setup();
        await record(result, 1);
        act(() => instances[0]!.ondataavailable?.(chunk(1)));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        await expectOneShot(result);
        expect(onFinal).toHaveBeenCalledTimes(1);
        expect(onFinal).toHaveBeenCalledWith("záloha");
        expect(finishAsync).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1); // no further uploads after a failure
      });

      it("when finish returns non-200", async () => {
        startAsync.mockResolvedValue(session());
        finishAsync.mockResolvedValue({ status: 404, body: { message: "gone" } });
        const { result, onFinal } = setup();
        await record(result, 1);
        await expectOneShot(result);
        expect(finishAsync).toHaveBeenCalledTimes(1);
        expect(onFinal).toHaveBeenCalledTimes(1);
        expect(onFinal).toHaveBeenCalledWith("záloha");
      });

      it("when finish throws", async () => {
        startAsync.mockResolvedValue(session());
        finishAsync.mockRejectedValue(new Error("net"));
        const { result, onFinal } = setup();
        await record(result, 1);
        await expectOneShot(result);
        expect(onFinal).toHaveBeenCalledTimes(1);
        expect(onFinal).toHaveBeenCalledWith("záloha");
      });

      it("when the SSE ends without a final", async () => {
        startAsync.mockResolvedValue(session());
        const { result, onFinal } = setup();
        await record(result, 1);
        await waitFor(() => expect(sse.instances()).toHaveLength(1));
        act(() => sse.last().emitError());
        await expectOneShot(result);
        expect(finishAsync).not.toHaveBeenCalled();
        expect(onFinal).toHaveBeenCalledTimes(1);
        expect(onFinal).toHaveBeenCalledWith("záloha");
      });
    });

    it("reports a network error when the fallback fails too, still once", async () => {
      mutateAsync.mockRejectedValue(new Error("503"));
      const { result, onFinal, onError } = setup();
      await record(result, 1);
      act(() => result.current.stop());
      await waitFor(() => expect(onError).toHaveBeenCalledWith("network"));
      expect(onFinal).not.toHaveBeenCalled();
      await waitFor(() => expect(result.current.interim).toBe(""));
    });

    it("a stale recording's SSE update does not touch the newer recording's interim", async () => {
      startAsync.mockResolvedValueOnce(session("one")).mockResolvedValueOnce(session("two"));
      finishAsync.mockReturnValue(new Promise(() => {}));
      const { result } = setup();
      await record(result, 1);
      await waitFor(() => expect(sse.instances()).toHaveLength(1));
      const first = sse.last();
      act(() => result.current.stop());
      await record(result, 2);
      await waitFor(() => expect(sse.instances()).toHaveLength(2));
      act(() => sse.last().emit({ text: "nové", final: false }));
      expect(result.current.interim).toBe("nové");
      act(() => first.emit({ text: "staré", final: false }));
      expect(result.current.interim).toBe("nové");
    });

    it("resets interim when a new recording starts", async () => {
      startAsync.mockResolvedValue(session());
      finishAsync.mockReturnValue(new Promise(() => {}));
      const { result } = setup();
      await record(result, 1);
      await waitFor(() => expect(sse.instances()).toHaveLength(1));
      act(() => sse.last().emit({ text: "ahoj", final: false }));
      act(() => result.current.stop());
      expect(result.current.interim).toBe("ahoj");
      await record(result, 2);
      expect(result.current.interim).toBe("");
    });

    it("unmount closes the EventSource and applies nothing afterwards", async () => {
      startAsync.mockResolvedValue(session());
      const { result, unmount } = setup();
      await record(result, 1);
      await waitFor(() => expect(sse.instances()).toHaveLength(1));
      const source = sse.last();
      unmount();
      expect(source.closed).toBe(true);
      expect(trackStop).toHaveBeenCalled();
    });
  });
});
