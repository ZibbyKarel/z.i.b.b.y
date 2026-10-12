import fs from "node:fs";
import path from "node:path";
import { Findings, Needs, Savings } from "./schemas.ts";
import { type Ctx, fail, kc, mdCell, pct, readState, stateDir } from "./ctx.ts";

const CITE = /\[([A-Z]-[^\]]+)\]/g;
const AMOUNT = /\d[\d  .,]*\s?(?:Kč|CZK)|(?:Kč|CZK)\s?\d/i;

const table = (head: string[], rows: string[][]): string =>
  rows.length
    ? [
        `| ${head.join(" | ")} |`,
        `|${head.map(() => "---").join("|")}|`,
        ...rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`),
      ].join("\n")
    : "_Nic k zobrazení._";

/** advice.md -> report.md: all numbers come from findings/savings JSON; advice only carries cited prose. */
export async function render(argv: string[], ctx: Ctx): Promise<number> {
  const input = argv[0];
  if (!input) throw new Error("usage: spend-audit render <advice.md>");
  const OUT = "report.md";
  const f = Findings.parse(readState(ctx, "findings.json"));
  const s = Savings.parse(readState(ctx, "savings.json"));
  const needsFile = path.join(stateDir(ctx), "needs.json");
  const needs = fs.existsSync(needsFile)
    ? Needs.parse(JSON.parse(fs.readFileSync(needsFile, "utf8")))
    : Needs.parse({});
  const advice = fs
    .readFileSync(path.resolve(ctx.cwd, input), "utf8")
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .trim();

  const known = new Set<string>([
    ...f.recurring.map((r) => r.id),
    ...f.duplicates.map((d) => d.id),
    ...f.large.map((l) => l.id),
    ...f.categories.map((c) => c.id),
    ...f.memberships.map((m) => m.id),
    ...s.items.map((i) => i.id),
  ]);
  const errors: string[] = [];
  advice.split("\n").forEach((line, i) => {
    const ids = [...line.matchAll(CITE)].flatMap((m) =>
      (m[1] as string).split(/[,;\s]+/).filter(Boolean),
    );
    for (const id of ids)
      if (!known.has(id)) errors.push(`line ${i + 1}: unknown citation [${id}]`);
    if (AMOUNT.test(line) && ids.length === 0)
      errors.push(`line ${i + 1}: Kč amount without a citation: "${line.trim().slice(0, 80)}"`);
  });
  if (errors.length)
    return fail(
      ctx,
      OUT,
      `advice.md is invalid. Cite only existing IDs from digest.md in square brackets, and put every Kč figure on a line that carries a citation (or drop the figure):\n${errors.map((e) => `- ${e}`).join("\n")}`,
    );

  const dec = new Map(needs.decisions.map((d) => [d.id, d.decision]));
  const period = `${f.period.from.slice(0, 7)} až ${f.period.to.slice(0, 7)}`;
  const firstPara =
    advice.split(/\n\s*\n/).find((p) => p.trim() && !p.trim().startsWith("#")) ?? "";
  const c = f.cashflow;
  const R: string[] = [
    `---\ntitle: Spending audit ${period}\ndomain: personal\ntags: [finance, spending-audit]\n---`,
    "",
  ];
  const sec = (title: string, body: string): number => R.push(`## ${title}`, "", body, "");

  sec(
    "Shrnutí",
    [
      `Období ${period} (${f.period.months} měsíců).`,
      "",
      `- Jistá úspora (zrušení + duplicity): **${kc(s.headline.certain)}**`,
      `- Ověřené nabídky: **${kc(s.headline.verified)}** ročně`,
      `- Celkem (jistá + ověřená): **${kc(s.headline.total)}**`,
      `- Cíl u kategorií nad ČSÚ (zvlášť): ${kc(s.target)} ročně`,
      `- Možná úspora (neověřeno): ${kc(s.possible)}`,
      "",
      firstPara,
    ].join("\n"),
  );
  sec(
    "Cashflow",
    [
      table(
        ["Položka", "Částka"],
        [
          ["Příjmy", kc(c.income)],
          ["Výdaje", kc(c.debits)],
          ["Míra úspor", pct(c.savingsRate)],
          ["Fixní výdaje", kc(c.fixed)],
          ["Variabilní výdaje", kc(c.variable)],
        ],
      ),
      "",
      `Pravidlo 50/30/20 (podíl z příjmů): potřeby ${pct(c.split.needs)}, přání ${pct(c.split.wants)}, úspory ${pct(c.split.savings)}, nezařazeno ${pct(c.split.other)}.`,
    ].join("\n"),
  );
  sec(
    "Služby a předplatné",
    table(
      [
        "ID",
        "Služba",
        "Kategorie",
        "Frekvence",
        "Měsíčně",
        "Ročně",
        "Stav",
        "Rozhodnutí",
        "Poznámky",
      ],
      f.recurring.map((r) => [
        r.id,
        r.name,
        r.category,
        r.cadence,
        kc(r.monthlyCost),
        kc(r.annualCost),
        r.active ? "aktivní" : "neaktivní",
        dec.get(r.id) ?? "-",
        [
          r.priceCreep
            ? `zdražení o ${r.priceCreep.pct} % (${kc(r.priceCreep.from)} -> ${kc(r.priceCreep.to)})`
            : "",
          r.trial ? "možná zkušební období" : "",
        ]
          .filter(Boolean)
          .join("; "),
      ]),
    ),
  );
  sec(
    "Duplicity a reklamace",
    table(
      ["ID", "Obchodník", "Částka", "Data", "Stav"],
      f.duplicates.map((d) => [
        d.id,
        d.name,
        kc(d.amount),
        d.dates.join(" a "),
        d.resolved ? `vráceno ${d.refundDate}` : "NEVYŘEŠENO",
      ]),
    ),
  );
  sec(
    "Velké nákupy",
    table(
      ["ID", "Datum", "Obchodník", "Kategorie", "Částka", "Důvod"],
      f.large.map((l) => [l.id, l.date, l.name, l.category, kc(l.amount), l.reason]),
    ),
  );
  const flagged = new Map(f.divisions.flatMap((d) => d.categories.map((k) => [k, d] as const)));
  sec(
    "Kategorie vs ČSÚ + trend",
    [
      `Benchmark: ${f.benchmarkSource}. Příznak jen při > 120 % a zároveň > 1 000 Kč měsíčně nad průměrem.`,
      "",
      table(
        ["ID", "Měsíčně", "Divize ČSÚ (měsíčně / průměr)", "Příznak", "Meziročně", "Trend ročně"],
        f.categories
          .filter((k) => k.category !== "income")
          .map((k) => {
            const d = flagged.get(k.category);
            return [
              k.id,
              kc(k.monthlyAvg),
              d ? `${d.division}: ${kc(d.monthlyActual)} / ${kc(d.monthlyBenchmark)}` : "-",
              d?.flagged ? `nad o ${kc(d.excessMonthly)}` : "-",
              k.yoyPct == null ? "n/a" : pct(k.yoyPct),
              k.slopePctPerYear == null ? "n/a" : pct(k.slopePctPerYear),
            ];
          }),
      ),
    ].join("\n"),
  );
  sec("Doporučení k chování", advice);
  sec(
    "Poplatky / cizí měna / hotovost",
    [
      `- Poplatky bance: ${kc(f.fees.feesTotal)}`,
      `- Platby v cizí měně: ${f.fees.fxCount}x, objem ${kc(f.fees.fxVolume)}`,
      `- Hotovost: ${kc(f.opaque.cash)}, převody v domácnosti: ${kc(f.opaque.householdTransfers)} (${pct(f.opaque.shareOfDebits)} výdajů je neprůhledných)`,
      `- Drobné platby do ${f.micro.threshold} Kč: ${f.micro.count}x, celkem ${kc(f.micro.total)}`,
    ].join("\n"),
  );
  const unverified = s.items.filter((i) => i.tier === "possible");
  sec(
    "Předpoklady a neověřené",
    [
      `- Zdroj benchmarku: ${f.benchmarkSource}; kategorie bez odpovídající divize COICOP se neposuzují.`,
      "- Roční úspora z nabídky = nižší z úspory za prvních 12 měsíců a poloviny úspory za 24 měsíců (aktivační poplatek i cena po akci zahrnuty).",
      ...(unverified.length
        ? [
            "",
            "Neověřené nebo nezodpovězené položky:",
            ...unverified.map(
              (i) =>
                `- ${i.id}: ${i.label} (${kc(i.annual)}${i.oneOff ? " jednorázově" : " ročně"})`,
            ),
          ]
        : []),
    ].join("\n"),
  );
  const todo = s.items.flatMap((i) => {
    if (i.kind === "cancel")
      return [`- [ ] Zrušit: ${i.label} (${i.id}), úspora ${kc(i.annual)} ročně`];
    if (i.kind === "duplicate" && i.tier === "certain")
      return [`- [ ] Reklamovat duplicitní platbu: ${i.label} (${i.id}), ${kc(i.annual)}`];
    if (i.kind === "offer" && i.tier === "verified")
      return [
        `- [ ] Přejít na nabídku: ${i.label} (${i.id}), ${kc(i.annual)} ročně${i.offer?.url ? ` - ${i.offer.url}` : ""}`,
      ];
    return [];
  });
  sec("Akční checklist", todo.length ? todo.join("\n") : "_Žádné potvrzené akce._");

  fs.writeFileSync(path.resolve(ctx.cwd, OUT), R.join("\n"));
  console.log(`render: ${OUT} written`);
  return 0;
}
