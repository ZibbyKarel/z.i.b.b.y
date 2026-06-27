import { describe, expect, it } from "vitest";
import { type ActivityEntry, type ActivityView, DEFAULT_ACTIVITY_VIEW } from "@zibby/contracts";
import { buildActivityLog } from "./activityLog";

/** Minimal entry factory — only the fields buildActivityLog reads. */
function entry(id: string, kind: ActivityEntry["kind"], at: string): ActivityEntry {
  return { id, kind, at, summary: id, refs: {} };
}

const ALL_VISIBLE: ActivityView = {
  tasks: "visible",
  runs: "visible",
  pipelines: "visible",
  goals: "visible",
  approvals: "visible",
  channels: "visible",
  integrations: "visible",
  research: "visible",
  briefing: "visible",
};

describe("buildActivityLog", () => {
  it("passes visible groups through one-per-row", () => {
    const rows = buildActivityLog(
      [entry("a", "task-created", "2026-06-12T10:00:00.000Z"), entry("b", "run-started", "2026-06-12T09:00:00.000Z")],
      ALL_VISIBLE,
    );
    expect(rows.map((r) => r.type)).toEqual(["entry", "entry"]);
  });

  it("drops hidden groups entirely", () => {
    const view: ActivityView = { ...ALL_VISIBLE, runs: "hidden" };
    const rows = buildActivityLog(
      [entry("a", "task-created", "2026-06-12T10:00:00.000Z"), entry("b", "run-started", "2026-06-12T09:00:00.000Z")],
      view,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "entry", entry: { id: "a" } });
  });

  it("coalesces a consecutive run of a grouped group into one counted row (newest at)", () => {
    const view: ActivityView = { ...ALL_VISIBLE, channels: "grouped" };
    const rows = buildActivityLog(
      [
        entry("c1", "channel-item", "2026-06-12T10:00:00.000Z"),
        entry("c2", "channel-triage", "2026-06-12T09:30:00.000Z"),
        entry("c3", "channel-reply", "2026-06-12T09:00:00.000Z"),
      ],
      view,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "group", group: "channels", count: 3, at: "2026-06-12T10:00:00.000Z" });
  });

  it("breaks a grouped run when a visible entry interrupts it", () => {
    const view: ActivityView = { ...ALL_VISIBLE, channels: "grouped" };
    const rows = buildActivityLog(
      [
        entry("c1", "channel-item", "2026-06-12T10:00:00.000Z"),
        entry("t1", "task-created", "2026-06-12T09:30:00.000Z"),
        entry("c2", "channel-reply", "2026-06-12T09:00:00.000Z"),
      ],
      view,
    );
    expect(rows.map((r) => r.type)).toEqual(["group", "entry", "group"]);
    expect(rows[0]).toMatchObject({ count: 1 });
    expect(rows[2]).toMatchObject({ count: 1 });
  });

  it("uses the seeded default view without throwing on every kind", () => {
    // Every kind maps to a group, so a default-config build never crashes.
    const rows = buildActivityLog(
      [entry("a", "briefing-generated", "2026-06-12T10:00:00.000Z")],
      DEFAULT_ACTIVITY_VIEW,
    );
    // briefing defaults to grouped → one group row.
    expect(rows[0]).toMatchObject({ type: "group", group: "briefing", count: 1 });
  });
});
