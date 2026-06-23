import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installEventSourceMock } from "../../../test/eventSourceMock";

// `API_URL` is a module-eval const off `process.env.NEXT_PUBLIC_API_URL`, which
// isn't reliably populated in the test process; mock the base so the hook resolves
// a real stream URL instead of short-circuiting as inert.
vi.mock("../../../state/api", () => ({ API_URL: "http://localhost:3333" }));

import { useChatStream } from "./useChatStream";

describe("useChatStream", () => {
  let mock: ReturnType<typeof installEventSourceMock>;

  beforeEach(() => {
    mock = installEventSourceMock();
  });
  afterEach(() => {
    mock.restore();
  });

  it("is inert with a null conversationId (opens no stream)", () => {
    const { result } = renderHook(() => useChatStream(null));
    expect(mock.instances()).toHaveLength(0);
    expect(result.current.streaming).toBe(false);
    expect(result.current.text).toBe("");
  });

  it("resolves the stream URL against API_URL and the conversation id", () => {
    renderHook(() => useChatStream("c1"));
    expect(mock.instances()).toHaveLength(1);
    expect(mock.last().url).toContain("/api/chat/stream?conversationId=c1");
  });

  it("accumulates deltas into the in-progress assistant text", () => {
    const { result } = renderHook(() => useChatStream("c1"));
    act(() => {
      mock.last().emit({ conversationId: "c1", turnId: "t1", type: "delta", text: "Ahoj" });
      mock.last().emit({ conversationId: "c1", turnId: "t1", type: "delta", text: " světe" });
    });
    expect(result.current.turnId).toBe("t1");
    expect(result.current.text).toBe("Ahoj světe");
    expect(result.current.streaming).toBe(true);
  });

  it("collects tool dispatch announcements for the current turn", () => {
    const { result } = renderHook(() => useChatStream("c1"));
    act(() => {
      mock.last().emit({
        conversationId: "c1",
        turnId: "t1",
        type: "tool",
        tool: { name: "create_task", status: "ok", summary: "Spustil jsem úkol.", href: "/runs" },
      });
    });
    expect(result.current.toolEvents).toHaveLength(1);
    expect(result.current.toolEvents[0]).toMatchObject({ name: "create_task", href: "/runs" });
  });

  it("hands the finished turn to onComplete (done.text authoritative) and resets the buffer", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useChatStream("c1", { onComplete }));
    act(() => {
      mock.last().emit({ conversationId: "c1", turnId: "t1", type: "delta", text: "partial" });
      mock.last().emit({
        conversationId: "c1",
        turnId: "t1",
        type: "tool",
        tool: { name: "create_task", status: "ok" },
      });
      mock.last().emit({ conversationId: "c1", turnId: "t1", type: "done", text: "final answer" });
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      turnId: "t1",
      text: "final answer",
      toolEvents: [{ name: "create_task", status: "ok" }],
    });
    // Live buffer resets so the streaming bubble vanishes as the caller commits.
    expect(result.current.streaming).toBe(false);
    expect(result.current.text).toBe("");
  });

  it("hands a terminal error to onError and stops streaming", () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useChatStream("c1", { onError }));
    act(() => {
      mock.last().emit({ conversationId: "c1", turnId: "t1", type: "delta", text: "x" });
      mock.last().emit({ conversationId: "c1", turnId: "t1", type: "error", message: "boom" });
    });
    expect(onError).toHaveBeenCalledWith("boom");
    expect(result.current.streaming).toBe(false);
  });

  it("resets the buffer when a new turn begins", () => {
    const { result } = renderHook(() => useChatStream("c1"));
    act(() => {
      mock.last().emit({ conversationId: "c1", turnId: "t1", type: "delta", text: "first" });
      mock.last().emit({ conversationId: "c1", turnId: "t1", type: "done", text: "first" });
      mock.last().emit({ conversationId: "c1", turnId: "t2", type: "delta", text: "second" });
    });
    expect(result.current.turnId).toBe("t2");
    expect(result.current.text).toBe("second");
    expect(result.current.streaming).toBe(true);
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() => useChatStream("c1"));
    const source = mock.last();
    expect(source.closed).toBe(false);
    unmount();
    expect(source.closed).toBe(true);
  });
});
