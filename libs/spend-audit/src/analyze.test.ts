import { describe, expect, it } from "vitest";
import { analyzeData } from "./analyze.ts";
import { main } from "./cli.ts";
import type { Benchmark, CategoryMap } from "./schemas.ts";
import { extract, get, mkTx, monthly, put, stmt, tmpCtx } from "./testkit.ts";

const cats: CategoryMap = {
  netflix: { name: "Netflix", category: "streaming", service: true },
  hbo: { name: "HBO", category: "streaming", service: true },
  dropbox: { name: "Dropbox", category: "software-cloud", service: true },
  gym: { name: "Gym", category: "leisure", service: true },
  mall: { name: "Mall", category: "eshop", service: false },
  rohlik: { name: "Rohlik", category: "groceries", service: false },
  salary: { name: "Employer", category: "income", service: false },
  tv: { name: "TV shop", category: "household-goods", service: false },
  wolt: { name: "Wolt", category: "food-delivery", service: false },
};
const bench = (v: Record<string, number | null>): Benchmark => ({
  year: 2025,
  source: "test",
  url: "",
  householdType: "t",
  perPersonMonthly: v,
});
const period = stmt("2025-01-01", "2026-03-31");

describe("analyzeData", () => {
  it("detects monthly and yearly recurring, price creep, trial and inactivity", () => {
    const txs = [
      ...monthly("2025-01-10", 15, -199, "NETFLIX.COM").map((t, i) =>
        i >= 8 ? { ...t, amount: -219 } : t,
      ),
      ...monthly("2025-03-05", 2, -1200, "Dropbox", 12),
      ...monthly("2025-01-15", 4, -500, "Gym"), // stopped in April 2025
      ...monthly("2026-02-01", 2, -99, "HBO.COM"), // too few payments for monthly
    ];
    const f = analyzeData(txs, [period], cats, null);
    const byId = Object.fromEntries(f.recurring.map((r) => [r.id, r]));
    expect(byId["R-netflix"]).toMatchObject({ cadence: "monthly", active: true, lastAmount: 219 });
    expect(byId["R-netflix"]?.priceCreep).toMatchObject({ from: 199, to: 219 });
    expect(byId["R-dropbox"]).toMatchObject({ cadence: "yearly", monthlyCost: 100 });
    expect(byId["R-gym"]?.active).toBe(false);
    expect(byId["R-hbo"]).toBeUndefined();
    // trial: first seen within 90 days of period end
    const t2 = analyzeData([...monthly("2026-01-05", 3, -149, "HBO.COM")], [period], cats, null);
    expect(t2.recurring[0]).toMatchObject({ trial: true, overlapGroup: "streaming" });
  });

  it("keeps a > 15 % price rise as one service and splits a multi-subscription biller", () => {
    const netflix = monthly("2025-01-10", 15, -199, "NETFLIX.COM").map((t, i) =>
      i >= 10 ? { ...t, amount: -289 } : t,
    );
    const apple = [
      ...monthly("2025-01-02", 15, -79, "APPLE.COM/BILL"),
      ...monthly("2025-01-18", 15, -269, "APPLE.COM/BILL"),
      mkTx("2025-06-20", -2490, "APPLE.COM/BILL"), // a one-off purchase stays out of both series
    ];
    const f = analyzeData([...netflix, ...apple], [period], cats, null);
    const byId = Object.fromEntries(f.recurring.map((r) => [r.id, r]));
    expect(byId["R-netflix"]?.priceCreep).toMatchObject({ from: 199, to: 289 });
    expect(Object.keys(byId).filter((id) => id.startsWith("R-apple"))).toEqual(
      expect.arrayContaining(["R-apple-bill-79", "R-apple-bill-269"]),
    );
    expect(f.large.map((l) => l.amount)).toContain(2490);
  });

  it("flags duplicates and resolves them by a refund", () => {
    const txs = [
      mkTx("2025-05-01", -890, "Mall"),
      mkTx("2025-05-02", -890, "Mall"),
      mkTx("2025-05-10", 890, "Mall"), // refund
      mkTx("2025-07-01", -450, "Wolt"),
      mkTx("2025-07-03", -450, "Wolt"),
    ];
    const f = analyzeData(txs, [period], cats, null);
    expect(f.duplicates.map((d) => [d.id, d.merchant, d.resolved])).toEqual([
      ["D-1", "mall", true],
      ["D-2", "wolt", false],
    ]);
  });

  it("finds large purchases", () => {
    const txs = [
      ...monthly("2025-01-03", 14, -300, "Rohlik", 1),
      mkTx("2025-06-06", -25000, "TV shop"),
    ];
    const f = analyzeData(txs, [period], cats, null);
    expect(f.large).toHaveLength(1);
    expect(f.large[0]).toMatchObject({ id: "L-1", merchant: "tv-shop", amount: 25000 });
  });

  it("flags a category only above 120 % AND 1000 Kč/month over the x4 benchmark", () => {
    // 15 months; groceries 9000/month vs 4 x 2000 = 8000 -> 112 %: no.
    const g = (amt: number) => monthly("2025-01-03", 15, -amt, "Rohlik");
    const b = bench({ "01": 2000 });
    expect(analyzeData(g(9000), [period], cats, b).divisions[0]?.flagged).toBe(false);
    // 10000 = 125 % but only 2000 over -> flagged; 8500 vs bench 5000 = 170 % and 3500 over
    expect(analyzeData(g(10000), [period], cats, b).divisions[0]).toMatchObject({
      id: "C-groceries",
      flagged: true,
    });
    // 120 %+ but < 1000 over: bench 1000 x4 = 4000, actual 4900 (122 %), over 900
    const f = analyzeData(g(4900), [period], cats, bench({ "01": 1000 }));
    expect(f.divisions[0]?.flagged).toBe(false);
    // null benchmark = skipped
    expect(analyzeData(g(10000), [period], cats, bench({ "01": null })).divisions).toEqual([]);
  });

  it("reports cashflow", () => {
    const txs = [
      ...monthly("2025-01-25", 15, 50000, "Salary").map((t) => ({ ...t, type: "income" as const })),
      ...monthly("2025-01-03", 15, -20000, "Rohlik"),
    ];
    const f = analyzeData(txs, [period], cats, null);
    expect(f.cashflow).toMatchObject({ income: 750000, debits: 300000, savingsRate: 60 });
  });
});

describe("analyze CLI", () => {
  it("fails listing merchant keys missing from categories.json", async () => {
    const ctx = tmpCtx();
    put(
      ctx,
      "extract.jsonl",
      extract([
        {
          id: "a",
          from: "2026-01-01",
          to: "2026-01-31",
          opening: 0,
          tx: [{ date: "2026-01-02", amount: -5, counterparty: "Foo" }],
        },
      ]),
    );
    expect(await main(["prepare", "extract.jsonl"], ctx)).toBe(0);
    put(ctx, "categories.json", "{}");
    expect(await main(["analyze", "categories.json"], ctx)).toBe(1);
    expect(get(ctx, "findings.md")).toContain("- foo");
    put(ctx, "categories.json", JSON.stringify({ foo: { name: "Foo", category: "nope" } }));
    expect(await main(["analyze", "categories.json"], ctx)).toBe(1);
    put(ctx, "categories.json", JSON.stringify({ foo: { name: "Foo", category: "other" } }));
    expect(await main(["analyze", "categories.json"], ctx)).toBe(0);
  });
});
