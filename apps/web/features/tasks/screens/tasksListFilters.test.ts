import { describe, expect, it } from "vitest";
import {
  EMPTY_TASK_LIST_FILTERS,
  parseTaskListFilters,
  writeTaskListFilters,
} from "./tasksListFilters";

describe("tasksListFilters", () => {
  it("defaults everything to all on an empty URL", () => {
    expect(parseTaskListFilters(new URLSearchParams())).toEqual(EMPTY_TASK_LIST_FILTERS);
  });

  it("round-trips a full filter set", () => {
    const filters = {
      company: "co-1",
      project: "p-1",
      department: "eng",
      state: "blocked",
      source: "channel",
    } as const;
    const qs = writeTaskListFilters(new URLSearchParams(), filters);
    expect(parseTaskListFilters(qs)).toEqual(filters);
  });

  it("falls back to all for unknown state/source values", () => {
    const f = parseTaskListFilters(new URLSearchParams("state=nope&source=bogus"));
    expect(f.state).toBe("");
    expect(f.source).toBe("");
  });

  it("omits defaults and keeps unrelated params", () => {
    const qs = writeTaskListFilters(new URLSearchParams("foo=1&state=done"), {
      ...EMPTY_TASK_LIST_FILTERS,
      company: "co-1",
    });
    expect(qs.toString()).toBe("foo=1&company=co-1");
  });
});
