import { describe, expect, it } from "vitest";
import { main } from "./cli.ts";
import { extract, get, getJson, put, tmpCtx } from "./testkit.ts";
import { merchantKey } from "./prepare.ts";

const tx = (
  date: string,
  amount: number,
  counterparty: string,
  extra: Record<string, unknown> = {},
) => ({ date, amount, counterparty, ...extra });

describe("merchantKey", () => {
  it("normalises names", () => {
    expect(merchantKey("rohlik.cz*123 PRAHA", "card")).toBe("rohlik");
    expect(merchantKey("NETFLIX.COM", "card")).toBe("netflix");
    expect(merchantKey("Alza.cz a.s.", "card")).toBe("alza");
    expect(merchantKey("", "fee")).toBe("unknown-fee");
  });
});

describe("prepare", () => {
  it("accepts a CSV export without balances (no reconcile)", async () => {
    const ctx = tmpCtx();
    put(
      ctx,
      "extract.jsonl",
      [
        {
          kind: "statement",
          id: "csv",
          from: "2026-01-01",
          to: "2026-01-31",
          opening: null,
          closing: null,
        },
        {
          kind: "tx",
          statement: "csv",
          date: "2026-01-02",
          amount: -100,
          currency: "CZK",
          type: "card",
          counterparty: "X",
          message: "",
        },
      ]
        .map((l) => JSON.stringify(l))
        .join("\n"),
    );
    expect(await main(["prepare", "extract.jsonl"], ctx)).toBe(0);
  });

  it("fails on a reconcile mismatch and writes the message into merchants.md", async () => {
    const ctx = tmpCtx();
    put(
      ctx,
      "extract.jsonl",
      extract([
        {
          id: "a",
          from: "2026-01-01",
          to: "2026-01-31",
          opening: 1000,
          closing: 5,
          tx: [tx("2026-01-02", -100, "X")],
        },
      ]),
    );
    expect(await main(["prepare", "extract.jsonl"], ctx)).toBe(1);
    expect(get(ctx, "merchants.md")).toContain("statement a");
  });

  it("dedupes across overlapping statements, keeps identical rows within one", async () => {
    const ctx = tmpCtx();
    const dup = tx("2026-01-20", -50, "Coffee", { message: "m" });
    put(
      ctx,
      "extract.jsonl",
      extract([
        {
          id: "a",
          from: "2026-01-01",
          to: "2026-01-31",
          opening: 1000,
          tx: [tx("2026-01-05", -10, "Shop"), tx("2026-01-05", -10, "Shop"), dup],
        },
        {
          id: "b",
          from: "2026-01-15",
          to: "2026-02-15",
          opening: 500,
          tx: [dup, tx("2026-02-01", -5, "Other")],
        },
      ]),
    );
    expect(await main(["prepare", "extract.jsonl"], ctx)).toBe(0);
    const txs = getJson(ctx, "spend/transactions.json") as Array<{ counterparty: string }>;
    expect(txs.map((t) => t.counterparty).sort()).toEqual(["Coffee", "Other", "Shop", "Shop"]);
    expect(get(ctx, "merchants.md")).toContain("| shop |");
  });

  it("anonymises accounts and flags household transfers", async () => {
    const ctx = tmpCtx({ SPEND_HOUSEHOLD_ACCOUNTS: "123456789/3030" });
    put(
      ctx,
      "extract.jsonl",
      extract([
        {
          id: "a",
          from: "2026-01-01",
          to: "2026-01-31",
          opening: 0,
          tx: [
            tx("2026-01-02", -100, "Manzelka", { type: "transfer", account: "123456789/3030" }),
            tx("2026-01-03", -5, "Bob", { type: "transfer", account: "999/0100" }),
          ],
        },
      ]),
    );
    expect(await main(["prepare", "extract.jsonl"], ctx)).toBe(0);
    const txs = getJson(ctx, "spend/transactions.json") as Array<{
      account: string;
      household: boolean;
    }>;
    expect(txs.map((t) => t.household)).toEqual([true, false]);
    expect(txs[0]?.account).toMatch(/^acct-[0-9a-f]{8}$/);
    expect(JSON.stringify(txs)).not.toContain("123456789");
  });
});
