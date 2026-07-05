import { TaskRunStatusSchema } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { RUN_STATUS_GROUPS, groupFilterParam } from "./statusGroups";

describe("RUN_STATUS_GROUPS", () => {
  it("partitions every TaskRunStatus into exactly one bucket", () => {
    const grouped = RUN_STATUS_GROUPS.flatMap((g) => g.statuses);
    // No status is dropped…
    expect([...grouped].sort()).toEqual([...TaskRunStatusSchema.options].sort());
    // …and none is double-counted (a status in two buckets would break the counts).
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("expands a bucket to a comma-separated `?filter=` value the runs screen parses", () => {
    const waiting = RUN_STATUS_GROUPS.find((g) => g.key === "waiting");
    expect(waiting && groupFilterParam(waiting)).toBe(
      "queued,scheduled,pending,held,awaiting-approval",
    );
  });
});
