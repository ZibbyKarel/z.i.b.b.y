import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastBus } from "../../../components/Toaster/toastBus";
import messages from "../../../i18n/messages/cs.json";

/** Mirror of the player's `PlaybackSettleReason` (the module is mocked below, so
 * the literal union is restated here rather than imported from the mock). */
type Reason = "ended" | "error" | "stopped" | "superseded";

// Mock the API client and the audio player at the module boundary. `vi.hoisted`
// declares the shared spies/capture so the hoisted `vi.mock` factories can close
// over them without a TDZ error.
const { synthesizeMutate, playCalls, stopSpy } = vi.hoisted(() => ({
  synthesizeMutate: vi.fn(),
  playCalls: [] as Array<{
    key: string;
    audioBase64: string;
    onSettled?: (reason: "ended" | "error" | "stopped" | "superseded") => void;
  }>,
  stopSpy: vi.fn(),
}));

vi.mock("../../../state/api", () => ({
  apiClient: { speech: { synthesize: { mutate: synthesizeMutate } } },
}));

vi.mock("./useAudioPlayback", () => ({
  playAudioPlayback: (
    key: string,
    audioBase64: string,
    onSettled?: (reason: Reason) => void,
  ) => {
    playCalls.push({ key, audioBase64, onSettled });
  },
  stopAudioPlayback: stopSpy,
}));

import {
  MAX_CHUNK_CHARS,
  VOICE_MODE_PLAYER_KEY,
  chunkForSpeech,
  useAutoSpeak,
} from "./useAutoSpeak";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="cs" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

/** Resolve a successful synthesize, echoing the chunk text into the audio so each
 * chunk's playback is distinguishable in `playCalls`. */
function ok(text: string) {
  return Promise.resolve({
    status: 200 as const,
    body: { audioBase64: `wav:${text}`, format: "wav", audioMs: null, synthMs: null, voice: null },
  });
}

/** Flush the microtask queue so a synth promise's `.then` (the play step) runs. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Fire the captured `onSettled` for the given play call — by default a natural
 * `"ended"` (a chunk finishing); pass another reason to simulate a barge-in. */
async function settle(index: number, reason: Reason = "ended") {
  await act(async () => {
    playCalls[index]?.onSettled?.(reason);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("chunkForSpeech", () => {
  it("packs whole sentences into a chunk when they fit", () => {
    expect(chunkForSpeech("Aaa. Bbb.", 40)).toEqual(["Aaa. Bbb."]);
  });

  it("respects sentence boundaries — never splits mid-sentence when they don't fit together", () => {
    const chunks = chunkForSpeech("Aaa aaa. Bbb bbb.", 10);
    expect(chunks).toEqual(["Aaa aaa.", "Bbb bbb."]);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(10);
  });

  it("hard-splits a single sentence longer than the limit, on word boundaries", () => {
    // One 20-word sentence, no interior punctuation → must be hard-split.
    const sentence = `${Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ")}.`;
    const chunks = chunkForSpeech(sentence, 12);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(12);
  });

  it("keeps every chunk within the daemon's 1200-char reject, even for one huge word", () => {
    const huge = "x".repeat(5000); // no whitespace, no punctuation
    for (const c of chunkForSpeech(huge)) expect(c.length).toBeLessThanOrEqual(1200);
  });

  it("caps at MAX_CHUNK_CHARS (≤1000) by default", () => {
    const long = `${"slovo ".repeat(1000)}`;
    for (const c of chunkForSpeech(long)) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
  });

  it("returns nothing for empty/whitespace text", () => {
    expect(chunkForSpeech("")).toEqual([]);
    expect(chunkForSpeech("   \n  ")).toEqual([]);
  });
});

// `speak()` chunks with the DEFAULT 1000-char cap (no test override), so to force
// multiple chunks each sentence must be long enough that two won't pack together
// (701 + 1 + 701 > 1000). Each is a single ≤1000 sentence → one chunk apiece.
const SENT_A = `${"a".repeat(700)}.`;
const SENT_B = `${"b".repeat(700)}.`;
const SENT_C = `${"c".repeat(700)}.`;
const SENT_Z = `${"z".repeat(700)}.`;

describe("useAutoSpeak", () => {
  let toastEmit: MockInstance;

  beforeEach(() => {
    playCalls.length = 0;
    stopSpy.mockClear();
    synthesizeMutate.mockReset();
    synthesizeMutate.mockImplementation(({ body }: { body: { text: string } }) => ok(body.text));
    toastEmit = vi.spyOn(toastBus, "emit");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("plays chunks sequentially, advancing on each settle, under the voice-mode key", async () => {
    const { result } = renderHook(() => useAutoSpeak(), { wrapper });

    act(() => result.current.speak(`${SENT_A} ${SENT_B}`));
    await flush();

    // Only the first chunk is playing so far.
    expect(playCalls).toHaveLength(1);
    expect(playCalls[0]?.key).toBe(VOICE_MODE_PLAYER_KEY);
    expect(playCalls[0]?.audioBase64).toBe(`wav:${SENT_A}`);
    expect(result.current.speaking).toBe(true);

    // First chunk settles → the second plays.
    await settle(0);
    expect(playCalls).toHaveLength(2);
    expect(playCalls[1]?.audioBase64).toBe(`wav:${SENT_B}`);
    expect(result.current.speaking).toBe(true);

    // Last chunk settles → the queue is done.
    await settle(1);
    expect(playCalls).toHaveLength(2);
    expect(result.current.speaking).toBe(false);
  });

  it("prefetches one chunk ahead — synthesizes n+1 while n plays, never all at once", () => {
    const { result } = renderHook(() => useAutoSpeak(), { wrapper });

    // Three sentences → three chunks; synth of a chunk starts synchronously.
    act(() => result.current.speak(`${SENT_A} ${SENT_B} ${SENT_C}`));

    // Chunk 0 (playing) + chunk 1 (prefetch) synthesized; chunk 2 is NOT yet.
    expect(synthesizeMutate).toHaveBeenCalledTimes(2);
    expect(synthesizeMutate).toHaveBeenNthCalledWith(1, { body: { text: SENT_A } });
    expect(synthesizeMutate).toHaveBeenNthCalledWith(2, { body: { text: SENT_B } });
  });

  it("cancel() stops playback and abandons the rest of the queue", async () => {
    const { result } = renderHook(() => useAutoSpeak(), { wrapper });

    act(() => result.current.speak(`${SENT_A} ${SENT_B} ${SENT_C}`));
    await flush();
    expect(result.current.speaking).toBe(true);
    const synthAtCancel = synthesizeMutate.mock.calls.length;

    act(() => result.current.cancel());
    expect(stopSpy).toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);

    // A stale settle after cancel must not advance the queue, and no further
    // synthesis is kicked off.
    await settle(0);
    expect(playCalls).toHaveLength(1);
    expect(synthesizeMutate.mock.calls.length).toBe(synthAtCancel);
  });

  it("a second speak() supersedes the first — stops it and starts fresh", async () => {
    const { result } = renderHook(() => useAutoSpeak(), { wrapper });

    act(() => result.current.speak(`${SENT_A} ${SENT_B}`));
    await flush();
    expect(playCalls).toHaveLength(1);

    act(() => result.current.speak(SENT_Z));
    await flush();

    // The first session was stopped; the new reply is now playing.
    expect(stopSpy).toHaveBeenCalled();
    expect(playCalls[1]?.audioBase64).toBe(`wav:${SENT_Z}`);
    expect(result.current.speaking).toBe(true);

    // A late settle from the FIRST session must not advance anything.
    await settle(0);
    expect(playCalls).toHaveLength(2);
  });

  it("a playback error advances to the next chunk (the player already toasted it)", async () => {
    const { result } = renderHook(() => useAutoSpeak(), { wrapper });

    act(() => result.current.speak(`${SENT_A} ${SENT_B}`));
    await flush();

    await settle(0, "error");

    expect(playCalls).toHaveLength(2);
    expect(playCalls[1]?.audioBase64).toBe(`wav:${SENT_B}`);
    expect(result.current.speaking).toBe(true);
  });

  it("a manual read-aloud superseding a chunk abandons the queue without killing the new playback", async () => {
    const { result } = renderHook(() => useAutoSpeak(), { wrapper });

    act(() => result.current.speak(`${SENT_A} ${SENT_B}`));
    await flush();
    expect(playCalls).toHaveLength(1);
    // Chunk 1 is already prefetched AND resolved by now (flush drained the
    // microtask queue) — the exact race the settle-reason fix closes: a
    // still-active session settling with a resolved next chunk must NOT fire
    // playAudioPlayback again within a microtask.
    expect(synthesizeMutate).toHaveBeenCalledTimes(2);

    // A phase-120 ReadAloudButton click supersedes the chunk's playback
    // (Decision 6 barge-in).
    await settle(0, "superseded");

    // The queue is torn down: no resume, and — critically — no stopAudioPlayback
    // (that would kill the operator's manual playback that just started).
    expect(playCalls).toHaveLength(1);
    expect(stopSpy).not.toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);

    // And it stays down: a later stale settle is inert.
    await settle(0, "ended");
    expect(playCalls).toHaveLength(1);
  });

  it("an external stop settling a chunk abandons the queue without stopping again", async () => {
    const { result } = renderHook(() => useAutoSpeak(), { wrapper });

    act(() => result.current.speak(`${SENT_A} ${SENT_B}`));
    await flush();

    await settle(0, "stopped");

    expect(playCalls).toHaveLength(1);
    expect(stopSpy).not.toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });

  it("toasts chat.voice.speakError and cancels the remainder on a synth failure", async () => {
    synthesizeMutate.mockImplementation(({ body }: { body: { text: string } }) =>
      body.text === SENT_B
        ? Promise.resolve({ status: 503 as const, body: { message: "daemon down" } })
        : ok(body.text),
    );
    const { result } = renderHook(() => useAutoSpeak(), { wrapper });

    act(() => result.current.speak(`${SENT_A} ${SENT_B}`));
    await flush();
    // Chunk 0 played fine; advance to chunk 1, whose synth fails.
    await settle(0);

    expect(toastEmit).toHaveBeenCalledWith({
      message: "Mluvenou odpověď se nepodařilo přehrát.",
    });
    expect(stopSpy).toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });

  it("does nothing for empty reply text", () => {
    const { result } = renderHook(() => useAutoSpeak(), { wrapper });
    act(() => result.current.speak("   "));
    expect(playCalls).toHaveLength(0);
    expect(result.current.speaking).toBe(false);
  });

  describe("configured voice (Phase 119c)", () => {
    it("sends options.voice in every synthesize call", async () => {
      const { result } = renderHook(() => useAutoSpeak({ voice: "cs-jarvis" }), { wrapper });

      act(() => result.current.speak(SENT_A));
      await flush();

      expect(synthesizeMutate).toHaveBeenCalledWith({
        body: { text: SENT_A, voice: "cs-jarvis" },
      });
    });

    it("omits voice when unset — the daemon's own default is used", async () => {
      const { result } = renderHook(() => useAutoSpeak(), { wrapper });

      act(() => result.current.speak(SENT_A));
      await flush();

      expect(synthesizeMutate).toHaveBeenCalledWith({ body: { text: SENT_A } });
    });

    it("reads a changed voice through a ref — the stable speak/cancel identities never rebuild", async () => {
      const initialProps: { voice?: string } = { voice: undefined };
      const { result, rerender } = renderHook(({ voice }) => useAutoSpeak({ voice }), {
        wrapper,
        initialProps,
      });
      const speakBefore = result.current.speak;
      const cancelBefore = result.current.cancel;

      rerender({ voice: "en-nova" });

      // A config change is absorbed by the ref — it must NOT rebuild the
      // controller (that would break `useChatStream`'s stable `onComplete`).
      expect(result.current.speak).toBe(speakBefore);
      expect(result.current.cancel).toBe(cancelBefore);

      act(() => result.current.speak(SENT_A));
      await flush();

      // But the NEXT synthesize call picks up the latest voice.
      expect(synthesizeMutate).toHaveBeenCalledWith({
        body: { text: SENT_A, voice: "en-nova" },
      });
    });
  });
});
