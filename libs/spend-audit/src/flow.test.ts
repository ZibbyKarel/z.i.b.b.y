import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeData } from "./analyze.ts";
import { main } from "./cli.ts";
import { offerSaving } from "./savings.ts";
import { type CategoryMap, Findings } from "./schemas.ts";
import { get, getJson, mkTx, monthly, put, stmt, tmpCtx } from "./testkit.ts";
import { type Ctx, writeJson } from "./ctx.ts";

const cats: CategoryMap = {
  netflix: { name: "Netflix", category: "streaming", service: true },
  hbo: { name: "HBO", category: "streaming", service: true },
  gym: { name: "Gym", category: "leisure", service: true },
  mall: { name: "Mall", category: "eshop", service: false },
};
const json = (o: unknown): string => "text\n```json\n" + JSON.stringify(o) + "\n```\n";

/** ctx with findings.json from synthetic data: Netflix + HBO active, Gym active, a duplicate at Mall. */
function seeded(): Ctx {
  const ctx = tmpCtx();
  const txs = [
    ...monthly("2025-10-10", 6, -200, "NETFLIX.COM"),
    ...monthly("2025-10-11", 6, -300, "HBO.COM"),
    ...monthly("2025-10-12", 6, -500, "Gym"),
    mkTx("2026-02-01", -900, "Mall"),
    mkTx("2026-02-02", -900, "Mall"),
  ];
  const f = analyzeData(txs, [stmt("2025-10-01", "2026-03-31")], cats, null);
  writeJson(path.join(ctx.cwd, "spend", "findings.json"), Findings.parse(f));
  return ctx;
}

describe("decide", () => {
  it("rejects unknown IDs and keeps transactions out of the brief", async () => {
    const ctx = seeded();
    put(ctx, "needs.md", json({ decisions: [{ id: "R-nope", decision: "keep" }] }));
    expect(await main(["decide", "needs.md"], ctx)).toBe(1);
    put(
      ctx,
      "needs.md",
      json({
        decisions: [
          { id: "R-gym", decision: "cancel" },
          { id: "R-netflix", decision: "cheaper", requirements: "4K" },
        ],
      }),
    );
    expect(await main(["decide", "needs.md"], ctx)).toBe(0);
    const brief = get(ctx, "research-brief.md");
    expect(brief).toContain("R-netflix");
    expect(brief).toContain("R-hbo"); // streaming overlap
    expect(brief).not.toContain("R-gym");
    expect(brief.replaceAll(new Date().toISOString().slice(0, 10), "")).not.toMatch(
      /20\d\d-\d\d-\d\d/,
    ); // no payment dates
    expect(brief).not.toContain("Mall");
    expect(fs.existsSync(path.join(ctx.cwd, "spend/needs.json"))).toBe(true);
  });
});

describe("savings", () => {
  const offer = {
    item: "R-netflix",
    provider: "Netflix",
    plan: "Basic",
    monthly: 100,
    activationFee: 0,
    url: "https://x",
    checkedAt: "2026-03-01",
    verified: true,
  };

  it("math: activation fee and promo / post-promo price over 12 and 24 months", () => {
    const o = {
      ...offer,
      activationFee: 600,
      promoMonthly: 50,
      promoMonths: 6,
      conditions: "",
      missing: "",
      promoMonths_: 0,
    };
    // cost12 = 600 + 6*50 + 6*100 = 1500; cost24 = 600 + 300 + 18*100 = 2700; current 200
    expect(offerSaving(200, o)).toEqual({ saving12: 900, saving24: 2100, annual: 900 });
  });

  it("builds tiers: certain / verified / target / possible", async () => {
    const ctx = seeded();
    put(
      ctx,
      "needs.md",
      json({
        decisions: [
          { id: "R-gym", decision: "cancel" },
          { id: "R-netflix", decision: "cheaper" },
        ],
        duplicates: [{ id: "D-1", confirmed: true }],
      }),
    );
    expect(await main(["decide", "needs.md"], ctx)).toBe(0);
    put(
      ctx,
      "refuted.md",
      "blah\n" +
        json({ offers: [offer, { ...offer, item: "R-hbo", monthly: 100 }] }) +
        "\n<verdict>ok</verdict>",
    );
    expect(await main(["savings", "refuted.md"], ctx)).toBe(0);
    const s = getJson(ctx, "spend/savings.json") as {
      headline: { certain: number; verified: number; total: number };
      possible: number;
    };
    // certain: gym 500*12 + duplicate 900; verified: netflix (200-100)*12; hbo undecided -> possible 200*12...
    expect(s.headline).toEqual({ certain: 6900, verified: 1200, total: 8100 });
    expect(s.possible).toBe(2400);
    expect(get(ctx, "digest.md")).toContain("[S-R-netflix]");
  });

  it("fails without an offers json block", async () => {
    const ctx = seeded();
    put(ctx, "refuted.md", "no json here");
    expect(await main(["savings", "refuted.md"], ctx)).toBe(1);
    expect(get(ctx, "digest.md")).toContain("append");
  });
});

describe("render", () => {
  async function ready(): Promise<Ctx> {
    const ctx = seeded();
    put(ctx, "needs.md", json({ decisions: [{ id: "R-gym", decision: "cancel" }] }));
    await main(["decide", "needs.md"], ctx);
    put(ctx, "refuted.md", json({ offers: [] }));
    await main(["savings", "refuted.md"], ctx);
    return ctx;
  }

  it("rejects unknown citations and uncited amounts", async () => {
    const ctx = await ready();
    put(ctx, "advice.md", "Zrušte posilovnu [R-ghost].");
    expect(await main(["render", "advice.md"], ctx)).toBe(1);
    expect(get(ctx, "report.md")).toContain("unknown citation [R-ghost]");
    put(ctx, "advice.md", "Ušetříte 5 000 Kč ročně.");
    expect(await main(["render", "advice.md"], ctx)).toBe(1);
    expect(get(ctx, "report.md")).toContain("without a citation");
  });

  it("renders sections in order with cs-CZ numbers", async () => {
    const ctx = await ready();
    put(ctx, "advice.md", "Zrušte posilovnu, ušetříte 6 000 Kč [R-gym] [S-R-gym].\n");
    expect(await main(["render", "advice.md"], ctx)).toBe(0);
    const r = get(ctx, "report.md");
    expect(
      r.startsWith(
        "---\ntitle: Spending audit 2025-10 až 2026-03\ndomain: personal\ntags: [finance, spending-audit]\n---",
      ),
    ).toBe(true);
    const heads = [...r.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(heads).toEqual([
      "Shrnutí",
      "Cashflow",
      "Služby a předplatné",
      "Duplicity a reklamace",
      "Velké nákupy",
      "Kategorie vs ČSÚ + trend",
      "Doporučení k chování",
      "Poplatky / cizí měna / hotovost",
      "Předpoklady a neověřené",
      "Akční checklist",
    ]);
    expect(r).toContain("6 000 Kč");
    expect(r).toContain("- [ ] Zrušit: cancel Gym");
  });
});
