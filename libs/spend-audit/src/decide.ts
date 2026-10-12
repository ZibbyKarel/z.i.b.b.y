import fs from "node:fs";
import path from "node:path";
import { Findings, Needs } from "./schemas.ts";
import {
  type Ctx,
  fail,
  kc,
  lastJsonBlock,
  mdCell,
  readState,
  stateDir,
  writeJson,
} from "./ctx.ts";

const MAX_ITEMS = 8;

/** needs.md (last fenced json) -> spend/needs.json + research-brief.md (services only, no transactions). */
export async function decide(argv: string[], ctx: Ctx): Promise<number> {
  const input = argv[0];
  if (!input) throw new Error("usage: spend-audit decide <needs.md>");
  const OUT = "research-brief.md";
  const f = Findings.parse(readState(ctx, "findings.json"));
  const block = lastJsonBlock(fs.readFileSync(path.resolve(ctx.cwd, input), "utf8"));
  if (!block)
    return fail(
      ctx,
      OUT,
      'needs.md has no fenced ```json block. Append { "decisions": [...], "duplicates": [...], "categories": [...] }.',
    );
  let json: unknown;
  try {
    json = JSON.parse(block);
  } catch (e) {
    return fail(
      ctx,
      OUT,
      `the last json block of needs.md is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const parsed = Needs.safeParse(json);
  if (!parsed.success)
    return fail(
      ctx,
      OUT,
      `needs json has the wrong shape:\n${parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    );
  const needs = parsed.data;

  const known = {
    decisions: new Set([...f.recurring.map((r) => r.id), ...f.memberships.map((m) => m.id)]),
    duplicates: new Set(f.duplicates.map((d) => d.id)),
    categories: new Set(f.categories.map((c) => c.id)),
  };
  const unknown = (["decisions", "duplicates", "categories"] as const).flatMap((k) =>
    needs[k].filter((x) => !known[k].has(x.id)).map((x) => `${k}: unknown id "${x.id}"`),
  );
  if (unknown.length)
    return fail(
      ctx,
      OUT,
      `Unknown IDs in needs json (use only IDs from findings.md):\n${unknown.map((u) => `- ${u}`).join("\n")}`,
    );
  writeJson(path.join(stateDir(ctx), "needs.json"), needs);

  const dec = new Map(needs.decisions.map((d) => [d.id, d]));
  const items: Array<{
    id: string;
    name: string;
    monthly: number;
    cadence: string;
    req: string;
    why: string;
  }> = [];
  const add = (id: string, name: string, monthly: number, cadence: string, why: string): void => {
    if (items.some((i) => i.id === id) || dec.get(id)?.decision === "cancel") return;
    items.push({ id, name, monthly, cadence, req: dec.get(id)?.requirements ?? "", why });
  };
  const active = f.recurring.filter((r) => r.active);
  const groupSize = (g: string): number => active.filter((r) => r.overlapGroup === g).length;
  for (const r of active) {
    if (dec.get(r.id)?.decision === "cheaper")
      add(r.id, r.name, r.monthlyCost, r.cadence, "operator wants a cheaper alternative");
    else if (r.overlapGroup && groupSize(r.overlapGroup) >= 2)
      add(r.id, r.name, r.monthlyCost, r.cadence, `overlaps with other ${r.overlapGroup} services`);
  }
  for (const m of f.memberships)
    add(
      m.id,
      m.name,
      m.total / f.period.months,
      `${m.ordersPerMonth} orders/month (avg monthly spend, check for a membership/loyalty plan)`,
      "frequent orders, membership candidate",
    );
  const picked = items.sort((a, b) => b.monthly - a.monthly).slice(0, MAX_ITEMS);

  const today = new Date().toISOString().slice(0, 10);
  const md = `# Research brief

## Pokyny pro výzkum / Instructions for the researcher

Household: 2 adults + 2 small children, Czech Republic. Today is ${today}.
For EACH item below find: (a) a cheaper tier of the SAME provider, (b) family / shared / household plans, (c) competing providers.
For every offer record: URL, checkedAt (${today}), conditions (new-customers-only, promo length, contract binding) and what is MISSING compared with the operator's requirements.
Write \`offers.md\` as: first the section "## Pokyny pro ověření" copied VERBATIM from below, then your findings per item, then ONE final fenced \`\`\`json block exactly in this shape (set \`verified\` to false, \`promoMonthly\`/\`promoMonths\` null when no promo, \`item\` = the item ID):

\`\`\`json
{ "offers": [{ "item": "R-netflix", "provider": "", "plan": "", "monthly": 0, "activationFee": 0, "promoMonthly": null, "promoMonths": null, "url": "", "checkedAt": "${today}", "conditions": "", "missing": "", "verified": false }] }
\`\`\`

## Pokyny pro ověření / Instructions for the verifier

Re-open EVERY url in the offers and confirm the price and conditions. Set \`verified: true\` ONLY for what you confirmed; correct wrong numbers; drop offers that do not exist or do not apply to the household.
Your output MUST contain the corrected offers in the same JSON shape as the LAST fenced \`\`\`json block of refuted.md (placed before the <verdict> tag). Everything else in the file is ignored by the next step; without that block the step fails.

## Items (${picked.length})

| ID | service | current monthly price | cadence | operator requirements | why |
|---|---|---|---|---|---|
${picked.map((i) => `| ${i.id} | ${mdCell(i.name)} | ${kc(i.monthly)} | ${mdCell(i.cadence)} | ${mdCell(i.req) || "-"} | ${i.why} |`).join("\n")}
`;
  fs.writeFileSync(path.resolve(ctx.cwd, OUT), md);
  console.log(`decide: ${picked.length} items -> ${OUT}`);
  return 0;
}
