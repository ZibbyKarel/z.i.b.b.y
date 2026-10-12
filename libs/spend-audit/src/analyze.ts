import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Benchmark,
  CATEGORIES,
  CATEGORY_MAP,
  Categories,
  type Category,
  type CategoryFinding,
  type CategoryMap,
  type Findings,
  type Recurring,
  type Statement,
  StatementLine,
  Tx,
} from "./schemas.ts";
import { Findings as FindingsSchema } from "./schemas.ts";
import {
  type Ctx,
  day,
  fail,
  kc,
  mdCell,
  median,
  pct,
  readState,
  round2,
  stateDir,
  sum,
  writeJson,
} from "./ctx.ts";
import { z } from "zod";

export const BENCHMARK_FILE = fileURLToPath(new URL("../data/csu-benchmark.json", import.meta.url));
const PERSONS = 4;
const MONTH = 30.4375;
const MICRO = 200;
const NON_PURCHASE = new Set<Category>([
  "income",
  "household-transfer",
  "savings-investment",
  "cash",
]);
const CADENCES = [
  { name: "weekly", lo: 6, hi: 8, days: 7, perMonth: 52 / 12, min: 3 },
  { name: "monthly", lo: 27, hi: 33, days: 30, perMonth: 1, min: 3 },
  { name: "quarterly", lo: 85, hi: 95, days: 91, perMonth: 1 / 3, min: 3 },
  { name: "yearly", lo: 355, hi: 375, days: 365, perMonth: 1 / 12, min: 2 },
] as const;

interface Row {
  tx: Tx;
  cat: Category;
  name: string;
  amount: number;
  month: string;
}

/** Pure analysis over prepared data; every figure in the report comes from here. */
export function analyzeData(
  txs: Tx[],
  statements: Statement[],
  categories: CategoryMap,
  benchmark: Benchmark | null,
): Findings {
  const from = statements.map((s) => s.from).sort()[0] as string;
  const to = statements
    .map((s) => s.to)
    .sort()
    .at(-1) as string;
  const months = Math.max(1, (day(to) - day(from) + 1) / MONTH);
  const endDay = day(to);
  const rows: Row[] = txs.map((tx) => {
    const c = categories[tx.merchant];
    return {
      tx,
      cat: tx.household ? "household-transfer" : (c?.category ?? "other"),
      name: c?.name ?? tx.merchant,
      amount: tx.amount,
      month: tx.date.slice(0, 7),
    };
  });
  const byMerchant = new Map<string, Row[]>();
  for (const r of rows)
    byMerchant.set(r.tx.merchant, [...(byMerchant.get(r.tx.merchant) ?? []), r]);
  const debits = rows.filter(
    (r) => r.amount < 0 && r.cat !== "income" && r.cat !== "savings-investment",
  );
  const purchases = rows.filter((r) => r.amount < 0 && !NON_PURCHASE.has(r.cat));

  // ---- recurring
  const recurring: Recurring[] = [];
  // A series is recurring when its median gap fits a cadence and its LAST 3 amounts sit within 15 %
  // (so a price rise still reads as one service and shows up as price creep). A merchant that bills
  // several subscriptions (e.g. Apple, Google Play) fails as a whole; it is then split by amount.
  const asRecurring = (id: string, merchant: string, pays: Row[]): Recurring | null => {
    if (pays.length < 2) return null;
    const gaps = pays.slice(1).map((r, i) => day(r.tx.date) - day((pays[i] as Row).tx.date));
    const cad = CADENCES.find((c) => median(gaps) >= c.lo && median(gaps) <= c.hi);
    if (!cad || pays.length < cad.min) return null;
    const recent = pays.slice(-3).map((r) => -r.amount);
    if ((Math.max(...recent) - Math.min(...recent)) / median(recent) >= 0.15) return null;
    const first = pays[0] as Row;
    const last = pays.at(-1) as Row;
    const [fa, la] = [-first.amount, -last.amount];
    const monthly = la * cad.perMonth;
    const active = endDay - day(last.tx.date) <= 1.5 * cad.days;
    const cat = last.cat;
    return {
      id,
      merchant,
      name: last.name,
      category: cat,
      cadence: cad.name,
      count: pays.length,
      first: first.tx.date,
      last: last.tx.date,
      firstAmount: round2(fa),
      lastAmount: round2(la),
      monthlyCost: round2(monthly),
      annualCost: round2(monthly * 12),
      active,
      priceCreep:
        active && la - fa >= 1
          ? { from: round2(fa), to: round2(la), pct: round2(((la - fa) / fa) * 100) }
          : null,
      trial: active && (endDay - day(first.tx.date) <= 90 || fa < 0.5 * la),
      overlapGroup: cat === "streaming" || cat === "software-cloud" ? cat : null,
    };
  };
  // Payments that belong to a recurring series: excluded from duplicates/large, counted as fixed.
  const recurringTx = new Set<string>();
  for (const [merchant, list] of byMerchant) {
    const pays = list
      .filter((r) => r.amount < 0 && !NON_PURCHASE.has(r.cat))
      .sort((a, b) => a.tx.date.localeCompare(b.tx.date));
    const whole = asRecurring(`R-${merchant}`, merchant, pays);
    if (whole) {
      recurring.push(whole);
      for (const r of pays) recurringTx.add(r.tx.id);
      continue;
    }
    const byAmount = new Map<number, Row[]>();
    for (const r of pays)
      byAmount.set(Math.round(-r.amount), [...(byAmount.get(Math.round(-r.amount)) ?? []), r]);
    for (const [amount, group] of byAmount) {
      const r = asRecurring(`R-${merchant}-${amount}`, merchant, group);
      if (r) {
        recurring.push(r);
        for (const g of group) recurringTx.add(g.tx.id);
      }
    }
  }
  recurring.sort((a, b) => b.annualCost - a.annualCost);
  const recurringKeys = new Set(recurring.map((r) => r.merchant));

  // ---- duplicates (same merchant+amount <= 3 days apart, not recurring; refund within 30 days resolves)
  // ponytail: debits < 100 Kč are ignored, otherwise two coffees on one day flood the list
  const duplicates: Findings["duplicates"] = [];
  const dupPairs: Array<{ a: Row; b: Row }> = [];
  for (const list of byMerchant.values()) {
    const pays = list
      .filter((r) => r.amount <= -100 && !NON_PURCHASE.has(r.cat) && !recurringTx.has(r.tx.id))
      .sort((a, b) => a.tx.date.localeCompare(b.tx.date));
    for (let i = 0; i < pays.length; i++)
      for (let j = i + 1; j < pays.length; j++) {
        const [a, b] = [pays[i] as Row, pays[j] as Row];
        if (day(b.tx.date) - day(a.tx.date) > 3) break;
        if (Math.abs(a.amount - b.amount) < 0.005) dupPairs.push({ a, b });
      }
  }
  dupPairs
    .sort((x, y) => x.b.tx.date.localeCompare(y.b.tx.date) || x.b.tx.id.localeCompare(y.b.tx.id))
    .forEach(({ a, b }, i) => {
      const refund = (byMerchant.get(b.tx.merchant) ?? []).find(
        (r) =>
          r.amount > 0 &&
          Math.abs(r.amount + b.amount) < 0.005 &&
          day(r.tx.date) >= day(a.tx.date) &&
          day(r.tx.date) - day(b.tx.date) <= 30,
      );
      duplicates.push({
        id: `D-${i + 1}`,
        merchant: b.tx.merchant,
        name: b.name,
        amount: round2(-b.amount),
        dates: [a.tx.date, b.tx.date],
        resolved: !!refund,
        refundDate: refund?.tx.date ?? null,
      });
    });

  // ---- category series
  const monthList: string[] = [];
  for (
    let y = +from.slice(0, 4), m = +from.slice(5, 7);
    `${y}-${String(m).padStart(2, "0")}` <= to.slice(0, 7);
    m === 12 ? (y++, (m = 1)) : m++
  )
    monthList.push(`${y}-${String(m).padStart(2, "0")}`);
  const catRows = new Map<Category, Row[]>();
  for (const r of rows)
    if (r.cat !== "income") catRows.set(r.cat, [...(catRows.get(r.cat) ?? []), r]);
  const catFindings: CategoryFinding[] = [];
  for (const [category, list] of catRows) {
    const perMonth = monthList.map((m) =>
      round2(-sum(list.filter((r) => r.month === m).map((r) => r.amount))),
    );
    const total = round2(sum(perMonth));
    if (total === 0) continue;
    const series = perMonth.map((amount, i) => ({
      month: monthList[i] as string,
      amount,
      rolling3: round2(sum(perMonth.slice(Math.max(0, i - 2), i + 1)) / Math.min(3, i + 1)),
    }));
    const n = perMonth.length;
    const prev = series[n - 13]?.rolling3;
    const yoyPct =
      n >= 13 && prev
        ? round2((((series[n - 1] as { rolling3: number }).rolling3 - prev) / prev) * 100)
        : null;
    let slopePctPerYear: number | null = null;
    const mean = total / n;
    if (n >= 6 && mean > 0) {
      const xm = (n - 1) / 2;
      const slope =
        sum(perMonth.map((y, x) => (x - xm) * (y - mean))) /
        sum(perMonth.map((_, x) => (x - xm) ** 2));
      slopePctPerYear = round2(((slope * 12) / mean) * 100);
    }
    catFindings.push({
      id: `C-${category}`,
      category,
      bucket: CATEGORY_MAP[category][0],
      total,
      monthlyAvg: round2(total / months),
      series,
      yoyPct,
      slopePctPerYear,
    });
  }
  catFindings.sort((a, b) => b.total - a.total);

  // ---- benchmark per COICOP division: > 120 % AND > 1000 Kč/month over; null = no benchmark
  const divisions: Findings["divisions"] = [];
  if (benchmark) {
    const divs = new Map<string, CategoryFinding[]>();
    for (const c of catFindings) {
      const d = CATEGORY_MAP[c.category][1];
      if (d) divs.set(d, [...(divs.get(d) ?? []), c]);
    }
    for (const [division, cats] of divs) {
      const per = benchmark.perPersonMonthly[division];
      if (per == null) continue;
      const monthlyBenchmark = round2(per * PERSONS);
      const monthlyActual = round2(sum(cats.map((c) => c.monthlyAvg)));
      const excessMonthly = round2(monthlyActual - monthlyBenchmark);
      divisions.push({
        id: (cats[0] as CategoryFinding).id,
        division,
        categories: cats.map((c) => c.category),
        monthlyActual,
        monthlyBenchmark,
        excessMonthly,
        flagged: monthlyActual > 1.2 * monthlyBenchmark && excessMonthly > 1000,
      });
    }
    divisions.sort((a, b) => b.excessMonthly - a.excessMonthly);
  }

  // ---- large
  const purchaseAmts = purchases.map((r) => -r.amount).sort((a, b) => a - b);
  const p99 =
    purchaseAmts[Math.min(purchaseAmts.length - 1, Math.ceil(purchaseAmts.length * 0.99) - 1)] ?? 0;
  const absLimit = Math.max(5000, p99);
  const catMedian = new Map<Category, number>();
  for (const c of catFindings) catMedian.set(c.category, median(c.series.map((s) => s.amount)));
  const large: Findings["large"] = [];
  purchases
    .filter((r) => !recurringTx.has(r.tx.id))
    .sort((a, b) => a.tx.date.localeCompare(b.tx.date))
    .forEach((r) => {
      const amt = -r.amount;
      // ponytail: the 3x-monthly-median rule also needs >= 1000 Kč, else every 700 Kč purchase in a 200 Kč/month category is "large"
      const reason =
        amt > absLimit
          ? `above ${kc(absLimit)}`
          : amt >= 1000 && amt > 3 * (catMedian.get(r.cat) ?? Infinity)
            ? `over 3x the monthly median of ${r.cat}`
            : null;
      if (reason)
        large.push({
          id: `L-${large.length + 1}`,
          date: r.tx.date,
          merchant: r.tx.merchant,
          name: r.name,
          category: r.cat,
          amount: round2(amt),
          reason,
        });
    });

  // ---- micro / top / memberships
  const micro = purchases.filter((r) => -r.amount < MICRO);
  const group = <K extends string>(list: Row[], key: (r: Row) => K) => {
    const m = new Map<K, { count: number; total: number }>();
    for (const r of list) {
      const e = m.get(key(r)) ?? { count: 0, total: 0 };
      m.set(key(r), { count: e.count + 1, total: round2(e.total - r.amount) });
    }
    return [...m.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.total - a.total);
  };
  const merchantStat = (list: Row[]) =>
    group(list, (r) => r.tx.merchant).map((g) => {
      const first = byMerchant.get(g.k)?.[0] as Row;
      return {
        merchant: g.k,
        name: first.name,
        category: first.cat,
        total: g.total,
        count: g.count,
        ordersPerMonth: round2(g.count / months),
      };
    });
  const stats = merchantStat(debits.filter((r) => r.cat !== "household-transfer"));
  const memberships = stats
    .filter(
      (s) =>
        (s.category === "eshop" || s.category === "groceries") &&
        s.ordersPerMonth >= 2 &&
        !recurringKeys.has(s.merchant),
    )
    .slice(0, 10)
    .map((s) => ({ ...s, id: `M-${s.merchant}` }));

  // ---- fees / opaque / cashflow
  const fees = rows.filter((r) => r.tx.type === "fee");
  const fx = purchases.filter((r) => r.tx.origCurrency && r.tx.origCurrency !== "CZK");
  const totalDebits = sum(debits.map((r) => -r.amount));
  const cash = -sum(rows.filter((r) => r.cat === "cash").map((r) => r.amount));
  const hh = -sum(rows.filter((r) => r.cat === "household-transfer").map((r) => r.amount));
  const income = sum(rows.filter((r) => r.cat === "income" && r.amount > 0).map((r) => r.amount));
  const fixedSet = new Set<string>();
  for (const r of purchases)
    if (recurringTx.has(r.tx.id) || r.tx.type === "direct-debit" || r.tx.type === "standing-order")
      fixedSet.add(r.tx.id);
  const fixed = sum(purchases.filter((r) => fixedSet.has(r.tx.id)).map((r) => -r.amount));
  const spendOf = (b: string): number =>
    -sum(
      rows.filter((r) => CATEGORY_MAP[r.cat][0] === b && r.cat !== "income").map((r) => r.amount),
    );
  const share = (v: number): number => (income > 0 ? round2((v / income) * 100) : 0);

  return {
    period: { from, to, months: round2(months) },
    benchmarkSource: benchmark
      ? `${benchmark.source} (${benchmark.year ?? "?"}, ${benchmark.householdType} x ${PERSONS})`
      : "none",
    recurring,
    duplicates,
    large,
    categories: catFindings,
    divisions,
    micro: {
      threshold: MICRO,
      count: micro.length,
      total: round2(sum(micro.map((r) => -r.amount))),
      byCategory: group(micro, (r) => r.cat).map((g) => ({
        category: g.k,
        count: g.count,
        total: g.total,
      })),
      byMerchant: group(micro, (r) => r.tx.merchant)
        .slice(0, 10)
        .map((g) => ({ merchant: g.k, count: g.count, total: g.total })),
    },
    top: {
      bySum: stats.slice(0, 10),
      byCount: [...stats].sort((a, b) => b.count - a.count).slice(0, 10),
    },
    memberships,
    fees: {
      feesTotal: round2(-sum(fees.map((r) => r.amount))),
      fxVolume: round2(-sum(fx.map((r) => r.amount))),
      fxCount: fx.length,
    },
    opaque: {
      cash: round2(cash),
      householdTransfers: round2(hh),
      shareOfDebits: totalDebits > 0 ? round2(((cash + hh) / totalDebits) * 100) : 0,
    },
    cashflow: {
      income: round2(income),
      debits: round2(totalDebits),
      savingsRate: income > 0 ? round2(((income - totalDebits) / income) * 100) : 0,
      fixed: round2(fixed),
      variable: round2(totalDebits - fixed),
      split: {
        needs: share(spendOf("needs")),
        wants: share(spendOf("wants")),
        savings: share(spendOf("savings")),
        other: share(spendOf("none")),
      },
    },
  };
}

export function findingsMd(f: Findings): string {
  const L: string[] = [];
  const c = f.cashflow;
  L.push(`# Findings ${f.period.from} .. ${f.period.to} (${f.period.months} months)`, "");
  L.push(
    "## Cashflow",
    `Income ${kc(c.income)}, debits ${kc(c.debits)}, savings rate ${pct(c.savingsRate)}; fixed ${kc(c.fixed)} vs variable ${kc(c.variable)}.`,
  );
  L.push(
    `50/30/20 (share of income): needs ${pct(c.split.needs)}, wants ${pct(c.split.wants)}, savings ${pct(c.split.savings)}, unassigned ${pct(c.split.other)}.`,
    "",
  );
  L.push(
    "## Recurring (by annual cost)",
    "| ID | service | category | cadence | monthly | annual | state | flags |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const r of f.recurring) {
    const flags = [
      r.priceCreep
        ? `price +${r.priceCreep.pct} % (${kc(r.priceCreep.from)} -> ${kc(r.priceCreep.to)})`
        : "",
      r.trial ? "trial?" : "",
      r.overlapGroup ? `overlap:${r.overlapGroup}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    L.push(
      `| ${r.id} | ${mdCell(r.name)} | ${r.category} | ${r.cadence} | ${kc(r.monthlyCost)} | ${kc(r.annualCost)} | ${r.active ? "active" : `inactive (last ${r.last})`} | ${flags} |`,
    );
  }
  L.push("", "## Duplicate payments");
  if (!f.duplicates.length) L.push("none");
  for (const d of [...f.duplicates].sort((a, b) => b.amount - a.amount))
    L.push(
      `- ${d.id} ${d.name} ${kc(d.amount)} on ${d.dates.join(" and ")}: ${d.resolved ? `refunded ${d.refundDate}` : "UNRESOLVED"}`,
    );
  L.push("", "## Large purchases");
  if (!f.large.length) L.push("none");
  for (const l of [...f.large].sort((a, b) => b.amount - a.amount))
    L.push(`- ${l.id} ${l.date} ${l.name} (${l.category}) ${kc(l.amount)}: ${l.reason}`);
  L.push(
    "",
    "## Categories (monthly avg, trend)",
    "| ID | monthly avg | total | YoY | trend/yr |",
    "|---|---|---|---|---|",
  );
  for (const k of f.categories.filter(
    (k) => k.category !== "household-transfer" && k.category !== "savings-investment",
  ))
    L.push(
      `| ${k.id} | ${kc(k.monthlyAvg)} | ${kc(k.total)} | ${k.yoyPct == null ? "n/a" : pct(k.yoyPct)} | ${k.slopePctPerYear == null ? "n/a" : pct(k.slopePctPerYear)} |`,
    );
  L.push("", `## Benchmark vs ČSÚ (${f.benchmarkSource})`);
  if (!f.divisions.length) L.push("no benchmark data");
  for (const d of f.divisions)
    L.push(
      `- ${d.id} division ${d.division} (${d.categories.join(", ")}): ${kc(d.monthlyActual)} vs ${kc(d.monthlyBenchmark)}/month${d.flagged ? ` FLAGGED, ${kc(d.excessMonthly)}/month over` : ""}`,
    );
  L.push(
    "",
    "## Top merchants",
    ...f.top.bySum.map(
      (m) => `- ${m.name} (${m.category}): ${kc(m.total)}, ${m.count}x, ${m.ordersPerMonth}/month`,
    ),
  );
  L.push(
    "",
    "## Membership candidates",
    ...(f.memberships.length
      ? f.memberships.map(
          (m) =>
            `- ${m.id} ${m.name}: ${m.ordersPerMonth} orders/month, ${kc(m.total / f.period.months)}/month`,
        )
      : ["none"]),
  );
  L.push(
    "",
    `## Micro payments (< ${f.micro.threshold} Kč)`,
    `${f.micro.count} payments, ${kc(f.micro.total)}`,
  );
  L.push(
    "",
    "## Fees, FX, opaque",
    `Fees ${kc(f.fees.feesTotal)}; FX payments ${f.fees.fxCount}, volume ${kc(f.fees.fxVolume)}.`,
  );
  L.push(
    `Cash ${kc(f.opaque.cash)} + household transfers ${kc(f.opaque.householdTransfers)} = ${pct(f.opaque.shareOfDebits)} of debits.`,
    "",
  );
  return L.join("\n");
}

export function loadBenchmark(file = BENCHMARK_FILE): Benchmark {
  return Benchmark.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

/** categories.json -> spend/findings.json + findings.md. `bench` is injectable for tests. */
export async function analyze(
  argv: string[],
  ctx: Ctx,
  bench: Benchmark | null = loadBenchmark(),
): Promise<number> {
  const input = argv[0];
  if (!input) throw new Error("usage: spend-audit analyze <categories.json>");
  const OUT = "findings.md";
  const txs = z.array(Tx).parse(readState(ctx, "transactions.json"));
  const statements = z.array(StatementLine).parse(readState(ctx, "statements.json"));
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(path.resolve(ctx.cwd, input), "utf8"));
  } catch (e) {
    return fail(
      ctx,
      OUT,
      `categories.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const parsed = Categories.safeParse(json);
  if (!parsed.success) {
    const msgs = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
    return fail(
      ctx,
      OUT,
      `categories.json is invalid. Allowed categories: ${CATEGORIES.join(", ")}\n${msgs.slice(0, 30).join("\n")}`,
    );
  }
  const missing = [...new Set(txs.map((t) => t.merchant))].filter((k) => !(k in parsed.data));
  if (missing.length)
    return fail(
      ctx,
      OUT,
      `categories.json misses ${missing.length} merchant keys, add them:\n${missing.map((k) => `- ${k}`).join("\n")}`,
    );
  const findings = FindingsSchema.parse(analyzeData(txs, statements, parsed.data, bench));
  writeJson(path.join(stateDir(ctx), "findings.json"), findings);
  fs.writeFileSync(path.resolve(ctx.cwd, OUT), findingsMd(findings));
  console.log(
    `analyze: ${findings.recurring.length} recurring, ${findings.duplicates.length} duplicates -> ${OUT}`,
  );
  return 0;
}
