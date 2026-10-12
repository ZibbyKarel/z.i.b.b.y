import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  CATEGORIES,
  type Statement,
  StatementLine,
  type Tx,
  type TxIn,
  TxLine,
} from "./schemas.ts";
import { type Ctx, fail, kc, mdCell, round2, stateDir, sum, writeJson } from "./ctx.ts";

const LEGAL =
  /\b(s\.?\s?r\.?\s?o\.?|a\.?\s?s\.?|spol|k\.?\s?s\.?|v\.?\s?o\.?\s?s\.?|gmbh|ltd|llc|inc|b\.?v\.?|ag|se)\b\.?/g;
const TLD = /\.(com|cz|sk|eu|net|org|io|co\.uk|de)\b/g;
// ponytail: fixed list of common Czech city suffixes; extend when a new one shows up in merchants.md
const CITIES = new Set(
  "praha prague brno ostrava plzen olomouc liberec ceske budejovice hradec kralove pardubice zlin kladno most opava frydek mistek karlovice havirov karvina teplice usti nad labem jihlava cz czk cze".split(
    " ",
  ),
);

/**
 * Merchant key: lowercase, no diacritics, `*` -> space, legal forms (s.r.o., a.s., ...),
 * TLDs (.com/.cz/...), digit runs >= 3 and trailing city suffixes dropped, max 3 words
 * joined with "-". `rohlik.cz*123 PRAHA` -> `rohlik`, `NETFLIX.COM` -> `netflix`.
 */
export function merchantKey(counterparty: string, type: string): string {
  const s = counterparty
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\*/g, " ")
    .replace(LEGAL, " ")
    .replace(TLD, " ")
    .replace(/\d{3,}/g, " ");
  const words = s.split(/[^a-z0-9]+/).filter((w) => w && !/^\d+$/.test(w));
  while (words.length > 1 && CITIES.has(words.at(-1) as string)) words.pop();
  const key = words.slice(0, 3).join("-");
  return key || `unknown-${type}`;
}

const acct = (raw: string): string =>
  `acct-${crypto.createHash("sha1").update(raw.replace(/\s+/g, "")).digest("hex").slice(0, 8)}`;

const ALLOWED = CATEGORIES.join(", ");

/** extract.jsonl -> spend/transactions.json + statements.json, merchants.md. */
export async function prepare(argv: string[], ctx: Ctx): Promise<number> {
  const input = argv[0];
  if (!input) throw new Error("usage: spend-audit prepare <extract.jsonl>");
  const OUT = "merchants.md";
  const errors: string[] = [];
  const statements: Statement[] = [];
  const raw: TxIn[] = [];
  fs.readFileSync(path.resolve(ctx.cwd, input), "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (!line.trim()) return;
      let obj: unknown;
      try {
        obj = JSON.parse(line);
      } catch {
        errors.push(`line ${i + 1}: not valid JSON`);
        return;
      }
      const kind = (obj as { kind?: unknown } | null)?.kind;
      const schema = kind === "statement" ? StatementLine : kind === "tx" ? TxLine : null;
      if (!schema) return void errors.push(`line ${i + 1}: "kind" must be "statement" or "tx"`);
      const r = schema.safeParse(obj);
      if (!r.success) {
        const msg = r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ");
        return void errors.push(`line ${i + 1}: ${msg}`);
      }
      if (r.data.kind === "statement") statements.push(r.data);
      else raw.push(r.data);
    });
  if (statements.length === 0 && errors.length === 0) errors.push("no statement lines found");
  const ids = new Set<string>();
  for (const s of statements) {
    if (ids.has(s.id)) errors.push(`statement "${s.id}" is defined twice`);
    ids.add(s.id);
  }
  for (const t of raw)
    if (!ids.has(t.statement))
      errors.push(`tx ${t.date} ${t.amount} references unknown statement "${t.statement}"`);
  if (errors.length)
    return fail(
      ctx,
      OUT,
      `extract.jsonl is invalid, re-extract and fix:\n${errors
        .slice(0, 30)
        .map((e) => `- ${e}`)
        .join("\n")}`,
    );

  // Reconcile every statement: opening + sum(tx) == closing, and credits/debits when given.
  for (const s of statements) {
    const own = raw.filter((t) => t.statement === s.id).map((t) => t.amount);
    const calc = s.opening == null ? null : round2(s.opening + sum(own));
    if (calc != null && s.closing != null && Math.abs(calc - s.closing) > 0.01)
      errors.push(
        `statement ${s.id}: opening ${s.opening} + ${own.length} transactions = ${calc}, but closing is ${s.closing} (diff ${round2(calc - s.closing)}). Missing, extra or mis-signed transactions.`,
      );
    if (s.credits != null && Math.abs(sum(own.filter((a) => a > 0)) - s.credits) > 0.01)
      errors.push(
        `statement ${s.id}: credits sum ${round2(sum(own.filter((a) => a > 0)))} != stated ${s.credits}`,
      );
    if (s.debits != null && Math.abs(sum(own.filter((a) => a < 0)) - s.debits) > 0.01)
      errors.push(
        `statement ${s.id}: debits sum ${round2(sum(own.filter((a) => a < 0)))} != stated ${s.debits}`,
      );
  }
  if (errors.length)
    return fail(
      ctx,
      OUT,
      `Statement reconciliation failed, re-extract the listed statements:\n${errors.map((e) => `- ${e}`).join("\n")}`,
    );

  // Dedupe overlapping statements: the same date+amount+counterparty+message in two different
  // statements is one payment (keep the first statement's rows); identical rows inside one statement stay.
  const order = [...statements]
    .sort((a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id))
    .map((s) => s.id);
  const owner = new Map<string, string>();
  const rank = (id: string): number => order.indexOf(id);
  const sorted = [...raw].sort((a, b) => rank(a.statement) - rank(b.statement));
  const final = sorted.filter((t) => {
    const key = [t.date, t.amount, t.counterparty, t.message].join("\u0000");
    const o = owner.get(key);
    if (o === undefined) {
      owner.set(key, t.statement);
      return true;
    }
    return o === t.statement;
  });

  const household = new Set(
    (ctx.env.SPEND_HOUSEHOLD_ACCOUNTS ?? "")
      .split(",")
      .map((a) => a.replace(/\s+/g, ""))
      .filter(Boolean),
  );
  const txs: Tx[] = final
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t, i) => {
      const rawAcct = t.account?.replace(/\s+/g, "") ?? "";
      const { kind, ...rest } = t;
      void kind;
      return {
        ...rest,
        id: `t${i + 1}`,
        account: rawAcct ? acct(rawAcct) : null,
        merchant: merchantKey(t.counterparty, t.type),
        household: rawAcct !== "" && household.has(rawAcct),
      };
    });

  const dir = stateDir(ctx);
  writeJson(path.join(dir, "transactions.json"), txs);
  writeJson(path.join(dir, "statements.json"), statements);

  const by = new Map<string, Tx[]>();
  for (const t of txs) by.set(t.merchant, [...(by.get(t.merchant) ?? []), t]);
  const rows = [...by.entries()]
    .map(([key, list]) => ({ key, list, total: sum(list.map((t) => t.amount)) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    .map(({ key, list, total }) => {
      const mix = new Map<string, number>();
      for (const t of list) mix.set(t.type, (mix.get(t.type) ?? 0) + 1);
      const mixS = [...mix.entries()].map(([k, n]) => `${k}x${n}`).join(", ");
      return `| ${key} | ${mdCell(list[0]?.counterparty ?? "")} | ${mixS} | ${list.length} | ${kc(total)} |`;
    });
  const md = `# Merchants to classify

Classify EVERY merchant key below. Output \`categories.json\`: a single JSON object, one entry per key:

\`\`\`json
{ "<merchantKey>": { "name": "Display name", "category": "<CategoryId>", "service": true } }
\`\`\`

- \`category\` must be one of: ${ALLOWED}
- \`service\` is true for recurring services/subscriptions (streaming, telco, software, insurance, memberships), false for shops and one-off payments.
- Own transfers between household members' accounts: \`household-transfer\`; savings/investments: \`savings-investment\`; salary and other inflows: \`income\`.
- Use the key exactly as written; do not add, merge or skip keys.

${statements.length} statements, ${txs.length} transactions (${raw.length - txs.length} duplicates from overlapping statements removed), ${by.size} merchants.

| key | sample counterparty | type mix | count | total |
|---|---|---|---|---|
${rows.join("\n")}
`;
  fs.writeFileSync(path.resolve(ctx.cwd, OUT), md);
  console.log(`prepare: ${txs.length} transactions, ${by.size} merchants -> ${OUT}`);
  return 0;
}
