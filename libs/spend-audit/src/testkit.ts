import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Ctx } from "./ctx.ts";

export const tmpCtx = (env: NodeJS.ProcessEnv = {}): Ctx => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "sa-"));
  return { cwd, env: { ZIBBY_RUN_DIR: cwd, ...env } };
};

export const put = (ctx: Ctx, name: string, content: string): void => {
  fs.writeFileSync(path.join(ctx.cwd, name), content);
};

export const get = (ctx: Ctx, name: string): string =>
  fs.readFileSync(path.join(ctx.cwd, name), "utf8");

export const getJson = (ctx: Ctx, rel: string): unknown => JSON.parse(get(ctx, rel));

import { merchantKey } from "./prepare.ts";
import type { Statement, Tx } from "./schemas.ts";

let seq = 0;
/** Prepared-transaction factory (what transactions.json holds). */
export const mkTx = (
  date: string,
  amount: number,
  counterparty: string,
  extra: Partial<Tx> = {},
): Tx => ({
  id: `t${++seq}`,
  statement: "s",
  date,
  amount,
  currency: "CZK",
  type: "card",
  counterparty,
  message: "",
  merchant: merchantKey(counterparty, extra.type ?? "card"),
  household: false,
  ...extra,
});

export const stmt = (from: string, to: string): Statement => ({
  kind: "statement",
  id: "s",
  from,
  to,
  opening: 0,
  closing: 0,
});

/** `n` monthly payments starting at `start` (YYYY-MM-DD), same day each month. */
export const monthly = (start: string, n: number, amount: number, who: string, step = 1): Tx[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(
      Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1 + i * step, +start.slice(8, 10)),
    );
    return mkTx(d.toISOString().slice(0, 10), amount, who);
  });

/** extract.jsonl text; closing is derived from the transactions unless overridden. */
export const extract = (
  stmts: Array<{
    id: string;
    from: string;
    to: string;
    opening: number;
    closing?: number;
    tx: Array<Record<string, unknown>>;
  }>,
): string =>
  stmts
    .flatMap((s) => {
      const amounts = s.tx.map((t) => t.amount as number);
      const closing =
        s.closing ?? Math.round((s.opening + amounts.reduce((a, b) => a + b, 0)) * 100) / 100;
      return [
        { kind: "statement", id: s.id, from: s.from, to: s.to, opening: s.opening, closing },
        ...s.tx.map((t) => ({
          kind: "tx",
          statement: s.id,
          currency: "CZK",
          type: "card",
          counterparty: "",
          message: "",
          ...t,
        })),
      ];
    })
    .map((l) => JSON.stringify(l))
    .join("\n");
