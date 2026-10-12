import fs from "node:fs";
import path from "node:path";
import { Findings, Needs, type Offer, Offers, Savings, type SavingsItem } from "./schemas.ts";
import {
  type Ctx,
  fail,
  kc,
  lastJsonBlock,
  pct,
  readState,
  round2,
  stateDir,
  sum,
  writeJson,
} from "./ctx.ts";

/** Cost of an offer over n months: activation fee + promo price during the promo, regular after it. */
export const offerCost = (o: Offer, n: number): number =>
  (o.activationFee ?? 0) +
  Array.from({ length: n }, (_, m) =>
    o.promoMonthly != null && m < (o.promoMonths ?? 0) ? o.promoMonthly : o.monthly,
  ).reduce((a, b) => a + b, 0);

/**
 * Annual saving of an offer = the more conservative of the first-12-month saving and half of the
 * 24-month saving (a promo that expires must not inflate the headline).
 */
export function offerSaving(
  current: number,
  o: Offer,
): { saving12: number; saving24: number; annual: number } {
  const saving12 = round2(current * 12 - offerCost(o, 12));
  const saving24 = round2(current * 24 - offerCost(o, 24));
  return { saving12, saving24, annual: round2(Math.min(saving12, saving24 / 2)) };
}

/** refuted.md (last fenced json = offers) -> spend/savings.json + digest.md. */
export async function savings(argv: string[], ctx: Ctx): Promise<number> {
  const input = argv[0];
  if (!input) throw new Error("usage: spend-audit savings <refuted.md>");
  const OUT = "digest.md";
  const f = Findings.parse(readState(ctx, "findings.json"));
  const needsFile = path.join(stateDir(ctx), "needs.json");
  const needs = fs.existsSync(needsFile)
    ? Needs.parse(JSON.parse(fs.readFileSync(needsFile, "utf8")))
    : Needs.parse({});
  const block = lastJsonBlock(fs.readFileSync(path.resolve(ctx.cwd, input), "utf8"));
  if (!block)
    return fail(
      ctx,
      OUT,
      'refuted.md has no fenced ```json block. Verifier: append the corrected offers as { "offers": [...] } (last json block, before the verdict tag).',
    );
  let json: unknown;
  try {
    json = JSON.parse(block);
  } catch (e) {
    return fail(
      ctx,
      OUT,
      `the last json block of refuted.md is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const parsed = Offers.safeParse(json);
  if (!parsed.success)
    return fail(
      ctx,
      OUT,
      `offers json has the wrong shape:\n${parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    );
  const offers = parsed.data.offers;
  const rec = new Map(f.recurring.map((r) => [r.id, r]));
  const memb = new Set(f.memberships.map((m) => m.id));
  const bad = offers
    .filter((o) => !rec.has(o.item) && !memb.has(o.item))
    .map((o) => `- unknown item "${o.item}"`);
  if (bad.length)
    return fail(
      ctx,
      OUT,
      `Offers reference unknown items (use R-/M- IDs from research-brief.md):\n${bad.join("\n")}`,
    );

  const dec = new Map(needs.decisions.map((d) => [d.id, d.decision]));
  const items: SavingsItem[] = [];
  const push = (
    i: Omit<SavingsItem, "saving12" | "saving24" | "offer"> & Partial<SavingsItem>,
  ): void => {
    items.push({ saving12: null, saving24: null, offer: null, ...i });
  };

  // certain: confirmed cancellations (annualised) and confirmed, still unrefunded duplicates (one-off)
  for (const r of f.recurring)
    if (dec.get(r.id) === "cancel" && r.active)
      push({
        id: `S-${r.id}`,
        tier: "certain",
        kind: "cancel",
        annual: r.annualCost,
        oneOff: false,
        label: `cancel ${r.name}`,
      });
  const confirmed = new Map(needs.duplicates.map((d) => [d.id, d.confirmed]));
  for (const d of f.duplicates) {
    if (d.resolved) continue;
    const c = confirmed.get(d.id);
    if (c === true)
      push({
        id: `S-${d.id}`,
        tier: "certain",
        kind: "duplicate",
        annual: d.amount,
        oneOff: true,
        label: `claim back duplicate ${d.name}`,
      });
    else if (c === undefined)
      push({
        id: `S-${d.id}`,
        tier: "possible",
        kind: "duplicate",
        annual: d.amount,
        oneOff: true,
        label: `unconfirmed duplicate ${d.name}`,
      });
  }

  // offers: best per item by 24-month saving; verified tier needs a verified offer and a keep/cheaper decision
  const byItem = new Map<string, Offer[]>();
  for (const o of offers) byItem.set(o.item, [...(byItem.get(o.item) ?? []), o]);
  for (const [item, list] of byItem) {
    const r = rec.get(item);
    const d = dec.get(item);
    if (!r || d === "cancel") continue; // membership offers are informational: no current price to compare with
    const scored = list
      .map((o) => ({ o, ...offerSaving(r.monthlyCost, o) }))
      .filter((s) => s.annual > 0);
    const pick = (xs: typeof scored) => xs.sort((a, b) => b.saving24 - a.saving24)[0];
    const ok = d === "cheaper" || d === "keep";
    const best = (ok && pick(scored.filter((s) => s.o.verified))) || pick(scored);
    if (!best) continue;
    push({
      id: `S-${item}`,
      tier: ok && best.o.verified ? "verified" : "possible",
      kind: "offer",
      annual: best.annual,
      oneOff: false,
      saving12: best.saving12,
      saving24: best.saving24,
      label: `${r.name} -> ${best.o.provider} ${best.o.plan}`.trim(),
      offer: best.o,
    });
  }
  // unanswered active services without any offer: upper bound = full annual cost
  for (const r of f.recurring)
    if (
      r.active &&
      (dec.get(r.id) ?? "unknown") === "unknown" &&
      !items.some((i) => i.id === `S-${r.id}`)
    )
      push({
        id: `S-${r.id}`,
        tier: "possible",
        kind: "unanswered",
        annual: r.annualCost,
        oneOff: false,
        label: `undecided ${r.name}`,
      });

  // target: flagged ČSÚ divisions down to benchmark, or the operator's own target per category
  const cdec = new Map(needs.categories.map((c) => [c.id, c]));
  const used = new Set<string>();
  for (const c of needs.categories) {
    const cat = f.categories.find((k) => k.id === c.id);
    if (c.decision !== "cut" || !cat || c.targetMonthly == null) continue;
    used.add(c.id);
    const annual = round2((cat.monthlyAvg - c.targetMonthly) * 12);
    if (annual > 0)
      push({
        id: `S-${c.id}`,
        tier: "target",
        kind: "category",
        annual,
        oneOff: false,
        label: `${c.id} down to ${kc(c.targetMonthly)}/month`,
      });
  }
  for (const d of f.divisions)
    if (d.flagged && !used.has(d.id) && cdec.get(d.id)?.decision !== "ok")
      push({
        id: `S-${d.id}`,
        tier: "target",
        kind: "category",
        annual: round2(d.excessMonthly * 12),
        oneOff: false,
        label: `${d.categories.join("+")} down to ČSÚ benchmark ${kc(d.monthlyBenchmark)}/month`,
      });

  const tier = (t: SavingsItem["tier"]): number =>
    round2(sum(items.filter((i) => i.tier === t).map((i) => i.annual)));
  const out = Savings.parse({
    headline: {
      certain: tier("certain"),
      verified: tier("verified"),
      total: round2(tier("certain") + tier("verified")),
    },
    target: tier("target"),
    possible: tier("possible"),
    items,
  });
  writeJson(path.join(stateDir(ctx), "savings.json"), out);

  const L: string[] = [
    "# Digest for the advice writer",
    "",
    "Numbers below are final; cite IDs in square brackets, never invent figures.",
    "",
  ];
  L.push(
    "## Headline",
    `- Certain (cancellations + duplicates): ${kc(out.headline.certain)}`,
    `- Verified offers: ${kc(out.headline.verified)}/year`,
    `- Headline total (certain + verified): ${kc(out.headline.total)}`,
  );
  L.push(
    `- Target (shown separately): ${kc(out.target)}/year`,
    `- Possible (unconfirmed): ${kc(out.possible)}`,
    "",
  );
  for (const t of ["certain", "verified", "target", "possible"] as const) {
    L.push(`## ${t[0]?.toUpperCase()}${t.slice(1)} items`);
    const list = items.filter((i) => i.tier === t).sort((a, b) => b.annual - a.annual);
    if (!list.length) L.push("none");
    for (const i of list)
      L.push(
        `- [${i.id}] ${i.label}: ${kc(i.annual)}${i.oneOff ? " one-off" : "/year"}${i.saving24 != null ? ` (12 months ${kc(i.saving12 ?? 0)}, 24 months ${kc(i.saving24)})` : ""}`,
      );
    L.push("");
  }
  L.push("## Flagged categories vs ČSÚ");
  const flagged = f.divisions.filter((d) => d.flagged);
  if (!flagged.length) L.push("none");
  for (const d of flagged) {
    const lead = f.categories.find((c) => c.id === d.id);
    L.push(
      `- [${d.id}] ${d.categories.join("+")}: ${kc(d.monthlyActual)}/month vs ČSÚ ${kc(d.monthlyBenchmark)} (${kc(d.excessMonthly)} over); YoY ${lead?.yoyPct == null ? "n/a" : pct(lead.yoyPct)}, trend ${lead?.slopePctPerYear == null ? "n/a" : pct(lead.slopePctPerYear)}/year`,
    );
  }
  L.push(
    "",
    "## Opaque spending",
    `Cash ${kc(f.opaque.cash)} + household transfers ${kc(f.opaque.householdTransfers)} = ${pct(f.opaque.shareOfDebits)} of debits.`,
    "",
  );
  L.push("## Operator decisions");
  for (const d of needs.decisions)
    L.push(`- [${d.id}] ${d.decision}${d.requirements ? `: ${d.requirements}` : ""}`);
  for (const c of needs.categories)
    L.push(
      `- [${c.id}] ${c.decision}${c.targetMonthly != null ? `, target ${kc(c.targetMonthly)}/month` : ""}`,
    );
  const unanswered = f.recurring.filter((r) => r.active && !dec.has(r.id)).map((r) => `[${r.id}]`);
  if (unanswered.length) L.push(`- unanswered: ${unanswered.join(", ")}`);
  fs.writeFileSync(path.resolve(ctx.cwd, OUT), L.join("\n") + "\n");
  console.log(`savings: headline ${kc(out.headline.total)} -> ${OUT}`);
  return 0;
}
