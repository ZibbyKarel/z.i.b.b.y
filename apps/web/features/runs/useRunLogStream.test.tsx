import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installEventSourceMock } from "../../test/eventSourceMock";

// `API_URL` is a module-eval const off `process.env.NEXT_PUBLIC_API_URL`, which
// isn't reliably populated in the test process; mock the base so the hooks resolve
// a real stream URL instead of short-circuiting as inert.
vi.mock("../../state/api", () => ({ API_URL: "http://localhost:3333" }));

import { useRunLogStream, useStageRunLogStream } from "./useRunLogStream";

describe("useStageRunLogStream (N1 — a live stage log is a stream, not a poll)", () => {
  let mock: ReturnType<typeof installEventSourceMock>;

  beforeEach(() => {
    mock = installEventSourceMock();
  });
  afterEach(() => {
    mock.restore();
    vi.restoreAllMocks();
  });

  it("is inert with a null phase (opens no stream)", () => {
    renderHook(() => useStageRunLogStream("delivery_1", null));
    expect(mock.instances()).toHaveLength(0);
  });

  it("tails the stage stream URL and appends chunks in order", () => {
    const { result } = renderHook(() => useStageRunLogStream("delivery_1", "build"));
    expect(mock.last().url).toBe(
      "http://localhost:3333/api/tasks/runs/delivery_1/stages/build/logs/stream",
    );
    act(() => {
      mock.last().emitOpen();
      mock.last().emit({ content: "line 1\n", nextOffset: 7, done: false });
      mock.last().emit({ content: "line 2\n", nextOffset: 14, done: false });
    });
    expect(result.current.text).toBe("line 1\nline 2\n");
    expect(result.current.done).toBe(false);
  });

  it("a done chunk ends the tail and closes the source", () => {
    const { result } = renderHook(() => useStageRunLogStream("delivery_1", "build"));
    act(() => {
      mock.last().emitOpen();
      mock.last().emit({ content: "bye\n", nextOffset: 4, done: true });
    });
    expect(result.current.done).toBe(true);
    expect(mock.last().closed).toBe(true);
  });

  it("falls back to the contract's offset poll when the stream never opens", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ content: "polled\n", nextOffset: 7, done: true }),
    } as unknown as Response);
    const { result } = renderHook(() => useStageRunLogStream("delivery_1", "build"));
    // An error BEFORE open means SSE is blocked end-to-end → the poll takes over.
    act(() => {
      mock.last().emitError();
    });
    await waitFor(() => expect(result.current.text).toBe("polled\n"));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3333/api/tasks/runs/delivery_1/stages/build/logs?offset=0",
      expect.anything(),
    );
    expect(result.current.done).toBe(true);
  });
});

describe("useRunLogStream (unchanged unified-run surface over the shared tail)", () => {
  let mock: ReturnType<typeof installEventSourceMock>;

  beforeEach(() => {
    mock = installEventSourceMock();
  });
  afterEach(() => {
    mock.restore();
  });

  it("keeps resolving the unified run-log stream URL", () => {
    renderHook(() => useRunLogStream("writer_1"));
    expect(mock.last().url).toBe("http://localhost:3333/api/tasks/runs/writer_1/logs/stream");
  });

  it("is inert with a null run id", () => {
    renderHook(() => useRunLogStream(null));
    expect(mock.instances()).toHaveLength(0);
  });
});
