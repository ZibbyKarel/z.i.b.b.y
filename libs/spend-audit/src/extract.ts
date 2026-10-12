import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Statement, TxIn } from "./schemas.ts";
import { type Ctx, fail, round2, sum } from "./ctx.ts";

const MONEY = String.raw`-?\d{1,3}(?: \d{3})*,\d{2}`;
const END_AMOUNTS = new RegExp(String.raw`(?<!\S)(${MONEY})\s+(${MONEY})\s*$`);
const START_DATE = /^\s*(\d{2})\.(\d{2})\.(\d{4})\b/;
const ACCOUNT = /^\d[\d-]*\s*\/\s*\d{4}$/;
const CARD = /^\d{6}\*+\d{4}$/;
const FOOTER =
  /Pokračování na straně|^\s*Zaúčtování|^\s*Provedení|Air Bank a\.s\.|Společnost zapsaná|Vklad na tomto|pojištění pohledávek|Informační přehled|^\s*\d+\/\d+\s*$|^=== PAGE|o systému pojištění/;
const FX = /^(\d[\d ]*,\d{2}) ([A-Z]{3}) kurz/;

const TYPE_MAP: Record<string, TxIn["type"]> = {
  "Platba kartou": "card",
  "Vrácení peněz": "card",
  "Výběr hotovosti": "cash",
  "Vklad hotovosti": "cash",
  "Trvalý příkaz": "standing-order",
  Inkaso: "direct-debit",
  "Odměny za placení": "income",
  Poplatek: "fee",
  Úrok: "income",
};

const money = (s: string): number => parseFloat(s.replace(/ /g, "").replace(",", "."));
const split = (s: string): string[] => s.trim().split(/\s{2,}/);
const iso = (y: string, m: string, d: string): string =>
  `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;

export interface ParsedStatement {
  statement: Statement;
  tx: TxIn[];
}

/**
 * Air Bank "layout" text (pypdf layout mode, pages separated by `=== PAGE n`) -> statement
 * header (parsed from page 1) + transactions. Pure; reconciliation is the caller's job.
 */
export function parseAirBankLayout(text: string, statementId: string): ParsedStatement {
  const page1 = text.split(/^=== PAGE \d+\s*$/m).find((p) => p.trim()) ?? "";
  const cardholder =
    page1
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ?? "";
  const need = (re: RegExp, what: string): RegExpMatchArray => {
    const m = page1.match(re);
    if (!m) throw new Error(`statement header: "${what}" not found on page 1`);
    return m;
  };
  const per = need(
    /Období výpisu:\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*-\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/,
    "Období výpisu",
  );
  const amount = (label: string): number =>
    money(need(new RegExp(`${label}:\\s*(${MONEY})`), label)[1] as string);
  const g = (i: number): string => per[i] as string;
  const statement: Statement = {
    kind: "statement",
    id: statementId,
    from: iso(g(3), g(2), g(1)),
    to: iso(g(6), g(5), g(4)),
    opening: amount("Počáteční zůstatek"),
    closing: amount("Konečný zůstatek"),
    credits: amount("Připsáno na účet"),
    debits: -Math.abs(amount("Odepsáno z účtu")),
  };

  // Group lines into records: a booking line (date + two trailing amounts) and its follow-ups.
  const records: Array<{ booking: string; lines: string[] }> = [];
  for (const l of text.split("\n").map((x) => x.trimEnd())) {
    if (FOOTER.test(l) || !l.trim()) continue;
    if (START_DATE.test(l) && END_AMOUNTS.test(l)) records.push({ booking: l, lines: [] });
    else records.at(-1)?.lines.push(l);
  }

  const tx: TxIn[] = records.map((r) => {
    const [, d = "", m = "", y = ""] = r.booking.match(START_DATE) ?? [];
    const amt = money((r.booking.match(END_AMOUNTS) as RegExpMatchArray)[1] as string);
    const middle = split(r.booking).slice(1, -2);
    const typ = middle[0] ?? "";
    const rest = middle.slice(1);
    const isCardLike = typ === "Platba kartou" || typ === "Výběr hotovosti";
    let acct: string | null = null;
    let origAmount: number | null = null;
    let origCurrency: string | null = null;
    const detailLines: string[] = [];
    r.lines.forEach((l, i) => {
      let ls = split(l).filter(Boolean);
      if (i === 0 && ls[0] && /^\d{2}\.\d{2}\.\d{4}$/.test(ls[0])) {
        // execution-date line: transaction code + optional account/card
        for (const s of ls.slice(2)) if (ACCOUNT.test(s) || CARD.test(s)) acct = s;
        return;
      }
      let t = ls.join(" ");
      const fx = t.match(FX);
      if (fx) {
        origAmount = money(fx[1] as string);
        origCurrency = fx[2] as string;
        return;
      }
      if (ls.length >= 2 && ACCOUNT.test(ls.at(-1) as string)) {
        acct = ls.at(-1) as string;
        ls = ls.slice(0, -1);
        t = ls.join(" ");
        if (!t) return;
      }
      if (ls.length === 1 && /^\d{11,}$/.test(ls[0] as string)) return;
      if (t) detailLines.push(t);
    });

    let nazev: string | undefined;
    let detail0: string | undefined;
    if (rest.length >= 2) [nazev, detail0] = rest;
    else if (rest.length === 1) {
      if (typ === "Příchozí úhrada" || typ === "Odchozí úhrada") nazev = rest[0];
      else detail0 = rest[0];
    }
    // On card payments the "Název" column is just the cardholder.
    if (nazev && cardholder && nazev.includes(cardholder)) nazev = undefined;
    const cands = [nazev, detail0].filter((x): x is string => !!x).concat(detailLines);
    let counter: string | undefined = nazev && !isCardLike ? nazev : undefined;
    if (counter === undefined) {
      counter =
        isCardLike && detail0
          ? detail0
          : (cands.find((x) => !/^(VS|KS|SS)\d/.test(x) && !/^\d{5,}/.test(x)) ?? "");
    }
    const message = isCardLike
      ? ""
      : [
          ...new Set([...(detail0 ? [detail0] : []), ...detailLines].filter((x) => x !== counter)),
        ].join(" | ");

    const type: TxIn["type"] =
      typ === "Odchozí úhrada" || typ === "Příchozí úhrada"
        ? amt < 0
          ? "transfer"
          : "income"
        : (TYPE_MAP[typ] ?? "other");
    return {
      kind: "tx",
      statement: statementId,
      date: iso(y, m, d),
      amount: amt,
      currency: "CZK",
      origAmount: origAmount === null ? null : amt < 0 ? -origAmount : origAmount,
      origCurrency,
      type,
      counterparty: counter,
      account: acct && !CARD.test(acct) ? acct : null,
      message,
    };
  });
  return { statement, tx };
}

// No -I: it would hide a `pip3 install --user pypdf`; instead drop the cwd entry from sys.path.
const PY = `
import sys, logging, warnings
sys.path = [p for p in sys.path if p]
warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)
from pypdf import PdfReader
sys.stdout.reconfigure(encoding="utf-8")
for n, page in enumerate(PdfReader(sys.argv[1]).pages, 1):
    print("=== PAGE", n)
    print(page.extract_text(extraction_mode="layout"))
`;

/** Layout text of a PDF via python3 + pypdf (in memory, stdout only; no temp files). */
function pdfLayout(file: string): string {
  const r = spawnSync("python3", ["-E", "-c", PY, file], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) {
    const err = r.error?.message ?? r.stderr;
    const hint = /ENOENT|No module named/.test(err)
      ? " - python3 with pypdf is required (pip3 install pypdf)"
      : "";
    throw new Error(`cannot read ${path.basename(file)}${hint}: ${err.trim().split("\n").at(-1)}`);
  }
  return r.stdout;
}

/** statement attachments (Air Bank PDFs) -> extract.jsonl (what `prepare` consumes). */
export async function extract(argv: string[], ctx: Ctx): Promise<number> {
  const OUT = "extract.jsonl";
  const dir = path.resolve(
    ctx.cwd,
    argv[0] ?? path.join(ctx.env.ZIBBY_RUN_DIR ?? ctx.cwd, "context", "attachments"),
  );
  if (!fs.existsSync(dir)) return fail(ctx, OUT, `attachments dir not found: ${dir}`);
  const files = fs.readdirSync(dir).sort();
  const csv = files.find((f) => /\.csv$/i.test(f));
  if (csv) return fail(ctx, OUT, `CSV statements are not supported yet: ${csv}`);
  const pdfs = files.filter((f) => /\.pdf$/i.test(f));
  if (!pdfs.length) return fail(ctx, OUT, `no *.pdf statements in ${dir}`);

  const parsed: ParsedStatement[] = [];
  const ids = new Set<string>();
  try {
    for (const f of pdfs) {
      const probe = parseAirBankLayout(pdfLayout(path.join(dir, f)), "");
      const base = `${probe.statement.from.slice(0, 7)}_${probe.statement.to.slice(0, 7)}`;
      const id = ids.has(base) ? `${base}_${path.parse(f).name}` : base;
      ids.add(id);
      parsed.push({
        statement: { ...probe.statement, id },
        tx: probe.tx.map((t) => ({ ...t, statement: id })),
      });
    }
  } catch (e) {
    return fail(ctx, OUT, e instanceof Error ? e.message : String(e));
  }

  const problems = parsed.flatMap(({ statement: s, tx }) => {
    const amounts = tx.map((t) => t.amount);
    const checks: Array<[string, number, number]> = [
      ["credits", round2(sum(amounts.filter((a) => a > 0))), s.credits ?? 0],
      ["debits", round2(sum(amounts.filter((a) => a < 0))), s.debits ?? 0],
      ["closing (opening + sum)", round2((s.opening ?? 0) + sum(amounts)), s.closing ?? 0],
    ];
    return checks
      .filter(([, got, want]) => Math.abs(got - want) > 0.004)
      .map(
        ([what, got, want]) =>
          `statement ${s.id}: ${what} parsed ${got} but header says ${want} (diff ${round2(got - want)})`,
      );
  });
  if (problems.length) return fail(ctx, OUT, `extract does not reconcile:\n${problems.join("\n")}`);

  fs.writeFileSync(
    path.resolve(ctx.cwd, OUT),
    parsed
      .flatMap((p) => [p.statement, ...p.tx])
      .map((l) => JSON.stringify(l))
      .join("\n") + "\n",
  );
  console.log(
    `extract: ${parsed.length} statement(s), ${sum(parsed.map((p) => p.tx.length))} transaction(s), reconcile OK`,
  );
  for (const p of parsed) console.log(`  ${p.statement.id}: ${p.tx.length} tx`);
  return 0;
}
