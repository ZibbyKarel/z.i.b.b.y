import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BudgetLedgerStore, isoWeekDates, monthDates, pragueDate } from "./ledger.store";

describe("pragueDate", () => {
  it("cuts the day on the Europe/Prague calendar, not UTC", () => {
    // 23:30 UTC on 2026-06-12 is 01:30 the next day in Prague (summer, UTC+2).
    expect(pragueDate(new Date("2026-06-12T23:30:00.000Z"))).toBe("2026-06-13");
    expect(pragueDate(new Date("2026-06-12T08:00:00.000Z"))).toBe("2026-06-12");
  });
});

describe("isoWeekDates", () => {
  it("returns Monday..date inclusive for a mid-week day", () => {
    const dates = isoWeekDates("2026-06-12"); // a Friday
    expect(dates[0]).toBe("2026-06-08"); // Monday
    expect(dates[dates.length - 1]).toBe("2026-06-12");
    expect(dates).toHaveLength(5);
  });

  it("starts on a Monday (UTCDay === 1)", () => {
    const first = isoWeekDates("2026-06-12")[0]!;
    expect(new Date(`${first}T00:00:00.000Z`).getUTCDay()).toBe(1);
  });

  it("spans a year boundary correctly", () => {
    const dates = isoWeekDates("2027-01-01"); // Friday → week starts 2026-12-28
    expect(dates[0]).toBe("2026-12-28");
    expect(dates).toContain("2027-01-01");
  });

  it("returns a single day for a Monday", () => {
    expect(isoWeekDates("2026-06-08")).toEqual(["2026-06-08"]);
  });
});

describe("monthDates", () => {
  it("returns 1st..date inclusive within the month", () => {
    const dates = monthDates("2026-06-12");
    expect(dates[0]).toBe("2026-06-01");
    expect(dates[dates.length - 1]).toBe("2026-06-12");
    expect(dates).toHaveLength(12);
  });

  it("returns a single day for the 1st", () => {
    expect(monthDates("2026-06-01")).toEqual(["2026-06-01"]);
  });

  it("does not bleed into an adjacent month", () => {
    expect(monthDates("2026-07-03")).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
  });
});

describe("BudgetLedgerStore", () => {
  let dir: string;
  let store: BudgetLedgerStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "budget-ledger-"));
    store = new BudgetLedgerStore(dir);
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("counts only the matching project on a given day", async () => {
    const now = new Date("2026-06-12T08:00:00.000Z");
    await store.record(
      { at: now.toISOString(), projectId: "alpha", runRef: "r1", kind: "agent" },
      now,
    );
    await store.record(
      { at: now.toISOString(), projectId: "alpha", runRef: "r2", kind: "agent" },
      now,
    );
    await store.record(
      { at: now.toISOString(), projectId: "beta", runRef: "r3", kind: "agent" },
      now,
    );
    expect(await store.countDaily("alpha", now)).toBe(2);
    expect(await store.countDaily("beta", now)).toBe(1);
    expect(await store.countDaily("gamma", now)).toBe(0);
  });

  it("a record from another day does not count toward today", async () => {
    const yesterday = new Date("2026-06-11T08:00:00.000Z");
    const today = new Date("2026-06-12T08:00:00.000Z");
    await store.record(
      { at: yesterday.toISOString(), projectId: "alpha", runRef: "r1", kind: "agent" },
      yesterday,
    );
    expect(await store.countDaily("alpha", today)).toBe(0);
  });

  it("weekly count spans the ISO week", async () => {
    const mon = new Date("2026-06-08T08:00:00.000Z");
    const fri = new Date("2026-06-12T08:00:00.000Z");
    await store.record(
      { at: mon.toISOString(), projectId: "alpha", runRef: "r1", kind: "agent" },
      mon,
    );
    await store.record(
      { at: fri.toISOString(), projectId: "alpha", runRef: "r2", kind: "agent" },
      fri,
    );
    expect(await store.countWeekly("alpha", fri)).toBe(2);
  });

  it("monthly count spans the calendar month, excluding the prior month", async () => {
    const may = new Date("2026-05-31T08:00:00.000Z");
    const jun1 = new Date("2026-06-01T08:00:00.000Z");
    const jun12 = new Date("2026-06-12T08:00:00.000Z");
    await store.record(
      { at: may.toISOString(), projectId: "alpha", runRef: "r0", kind: "agent" },
      may,
    );
    await store.record(
      { at: jun1.toISOString(), projectId: "alpha", runRef: "r1", kind: "agent" },
      jun1,
    );
    await store.record(
      { at: jun12.toISOString(), projectId: "alpha", runRef: "r2", kind: "agent" },
      jun12,
    );
    expect(await store.countMonthly("alpha", jun12)).toBe(2); // May run excluded
  });

  it("a missing day file reads as zero (fresh install)", async () => {
    expect(await store.countDaily("alpha", new Date("2026-06-12T08:00:00.000Z"))).toBe(0);
  });

  it("skips a torn/garbage line, counting the rest", async () => {
    const now = new Date("2026-06-12T08:00:00.000Z");
    await store.record(
      { at: now.toISOString(), projectId: "alpha", runRef: "r1", kind: "agent" },
      now,
    );
    const file = path.join(dir, `${pragueDate(now)}.jsonl`);
    await fs.appendFile(file, "{ this is not json\n", "utf8");
    await store.record(
      { at: now.toISOString(), projectId: "alpha", runRef: "r2", kind: "agent" },
      now,
    );
    expect(await store.countDaily("alpha", now)).toBe(2);
  });

  it("throws LedgerUnreadableError when the dir is a file (fail-closed signal)", async () => {
    const filePath = path.join(dir, "not-a-dir");
    await fs.writeFile(filePath, "x");
    const broken = new BudgetLedgerStore(filePath);
    await expect(
      broken.countDaily("alpha", new Date("2026-06-12T08:00:00.000Z")),
    ).rejects.toThrow();
  });
});
