import { describe, expect, it } from "vitest";
import { type HandoffEmployee, deriveHandoffWalkers } from "./deriveHandoffWalkers";

const emp = (id: string, department: string, currentRunId?: string, title?: string) =>
  ({ id, department, currentRunId, currentTaskTitle: title }) satisfies HandoffEmployee;

describe("deriveHandoffWalkers", () => {
  it("emits nothing on the first snapshot", () => {
    expect(deriveHandoffWalkers(undefined, [emp("a", "dev", "r1")])).toEqual([]);
  });

  it("emits a walker when a run moves to an employee in another department", () => {
    const walkers = deriveHandoffWalkers(
      [emp("a", "dev", "r1", "Build"), emp("b", "qa")],
      [emp("a", "dev"), emp("b", "qa", "r1", "Test it")],
    );
    expect(walkers).toEqual([{ id: "r1:a->b", agentId: "a", toRoomId: "qa", label: "Test it" }]);
  });

  it("falls back to the sender's task title, then the run id", () => {
    const prev = [emp("a", "dev", "r1", "Build"), emp("b", "qa")];
    expect(deriveHandoffWalkers(prev, [emp("a", "dev"), emp("b", "qa", "r1")])[0]?.label).toBe(
      "Build",
    );
    expect(
      deriveHandoffWalkers(
        [emp("a", "dev", "r1"), emp("b", "qa")],
        [emp("a", "dev"), emp("b", "qa", "r1")],
      )[0]?.label,
    ).toBe("r1");
  });

  it("ignores same-department moves, stable leases and a sender that still holds the run", () => {
    expect(
      deriveHandoffWalkers(
        [emp("a", "dev", "r1"), emp("b", "dev")],
        [emp("a", "dev"), emp("b", "dev", "r1")],
      ),
    ).toEqual([]);
    expect(
      deriveHandoffWalkers(
        [emp("a", "dev", "r1"), emp("b", "qa", "r1")],
        [emp("a", "dev", "r1"), emp("b", "qa", "r1")],
      ),
    ).toEqual([]);
    expect(
      deriveHandoffWalkers(
        [emp("a", "dev", "r1"), emp("b", "qa")],
        [emp("a", "dev", "r1"), emp("b", "qa", "r1")],
      ),
    ).toEqual([]);
  });

  it("emits nothing when a run just starts or ends (no sender / no receiver)", () => {
    expect(deriveHandoffWalkers([emp("b", "qa")], [emp("b", "qa", "r9")])).toEqual([]);
    expect(deriveHandoffWalkers([emp("a", "dev", "r1")], [emp("a", "dev")])).toEqual([]);
  });
});
