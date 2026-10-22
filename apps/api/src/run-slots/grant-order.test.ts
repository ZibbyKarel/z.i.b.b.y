import { describe, expect, it } from "vitest";
import { GrantQueue } from "./grant-order";

describe("GrantQueue", () => {
  it("is FIFO on equal ranks", () => {
    const q = new GrantQueue<string>();
    q.enqueue({}, "a");
    q.enqueue({}, "b");
    q.enqueue({}, "c");
    expect([q.shift(), q.shift(), q.shift(), q.shift()]).toEqual(["a", "b", "c", undefined]);
  });

  it("grants higher progress before an earlier waiter", () => {
    const q = new GrantQueue<string>();
    q.enqueue({ progress: 0.2 }, "early");
    q.enqueue({ progress: 0.8 }, "late");
    expect(q.shift()).toBe("late");
    expect(q.shift()).toBe("early");
  });

  it("round-robins across projects (least recently granted first)", () => {
    const q = new GrantQueue<string>();
    q.enqueue({ projectId: "A" }, "A1");
    q.enqueue({ projectId: "A" }, "A2");
    q.enqueue({ projectId: "B" }, "B1");
    q.noteGrant("A");
    expect(q.shift()).toBe("B1");
    expect(q.shift()).toBe("A1");
    expect(q.shift()).toBe("A2");
  });

  it("a fresh waiter of the project granted longest ago goes first", () => {
    const q = new GrantQueue<string>();
    q.enqueue({ projectId: "A" }, "A1");
    q.noteGrant("B");
    expect(q.shift()).toBe("A1"); // A was never granted; now A is the most recent
    q.enqueue({ projectId: "A" }, "A3");
    q.enqueue({ projectId: "B" }, "B2");
    expect(q.shift()).toBe("B2");
    expect(q.shift()).toBe("A3");
  });
});
