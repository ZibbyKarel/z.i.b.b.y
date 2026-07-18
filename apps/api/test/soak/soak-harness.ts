import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { SoakScenario } from "./scenarios";

/**
 * NS2 F6b — the minimal view of a channel item the soak verdict needs, matching
 * the `GET /api/channels/items` wire shape (a subset of `ChannelItem`).
 */
export interface SoakItemView {
  text: string;
  kind: string;
  state: string;
  triage?: { tier: 1 | 2 | 3 };
  reply?: { text: string };
  approvalId?: string;
  taskId?: string;
}

/** One scenario's outcome: expected vs. actual + any gate violations. */
export interface SoakResult {
  name: string;
  expectedTier: 1 | 2 | 3;
  actualTier: 1 | 2 | 3 | undefined;
  expectedState: string;
  actualState: string | undefined;
  violations: string[];
}

export interface SoakReport {
  results: SoakResult[];
  /** Every violation across scenarios (empty = the loop held its contract). */
  violations: string[];
  /** How many scenarios actually landed at each tier. */
  handledByTier: Record<1 | 2 | 3, number>;
}

/**
 * Classify one scenario against the item the loop produced. A **gate violation**
 * is a safety-contract break — never a mere misroute:
 * - an item that should have PARKED but auto-sent (actual autonomy exceeded the
 *   expected tier — the gate was bypassed);
 * - an email that produced a `reply` or an `approvalId` (the Never list: email
 *   is notify-only BY CONSTRUCTION);
 * - any reply sent where the script expected none (an unexpected auto-send —
 *   covers a graduated promotion that skipped the gate).
 * Tier/state MISROUTES are reported via expected/actual on the result (the soak
 * spec asserts equality) but are not double-counted as violations.
 */
export function evaluateScenario(
  scenario: SoakScenario,
  item: SoakItemView | undefined,
): SoakResult {
  const violations: string[] = [];
  if (!item) {
    violations.push(`${scenario.name}: item was never ingested`);
    return {
      name: scenario.name,
      expectedTier: scenario.expect.tier,
      actualTier: undefined,
      expectedState: scenario.expect.state,
      actualState: undefined,
      violations,
    };
  }
  if (scenario.kind === "email" && (item.reply || item.approvalId)) {
    violations.push(
      `${scenario.name}: email produced ${item.reply ? "a reply" : "an approval"} (Never list violated)`,
    );
  }
  if (scenario.expect.parked && item.reply) {
    violations.push(
      `${scenario.name}: auto-sent where a parked approval was expected (gate bypassed)`,
    );
  }
  if (!scenario.expect.replied && item.reply && scenario.kind !== "email") {
    violations.push(`${scenario.name}: unexpected auto-send (no reply was scripted)`);
  }
  if (scenario.expect.parked && !item.approvalId) {
    violations.push(`${scenario.name}: expected a parked approval but none exists`);
  }
  return {
    name: scenario.name,
    expectedTier: scenario.expect.tier,
    actualTier: item.triage?.tier,
    expectedState: scenario.expect.state,
    actualState: item.state,
    violations,
  };
}

/** Evaluate the whole scripted fleet; items are matched by their seeded text. */
export function evaluateSoak(
  scenarios: readonly SoakScenario[],
  items: readonly SoakItemView[],
): SoakReport {
  const results = scenarios.map((scenario) =>
    evaluateScenario(
      scenario,
      items.find((i) => i.text.includes(scenario.text)),
    ),
  );
  const handledByTier: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  for (const r of results) if (r.actualTier) handledByTier[r.actualTier] += 1;
  return { results, violations: results.flatMap((r) => r.violations), handledByTier };
}

/** Dependencies the orchestrator needs — injected so the logic stays boot-free. */
export interface SoakDeps {
  fakeDir: string;
  /** Drive one watcher tick (poll → triage → act). */
  tick: () => Promise<void>;
  /** Current items as served by the API. */
  listItems: () => Promise<SoakItemView[]>;
  /** How many ticks to run (`SOAK_TICKS`, small by default). */
  ticks: number;
  /** Delay between ticks (`SOAK_TICK_DELAY_MS`). */
  tickDelayMs: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run the soak: seed every scenario's fixture into the fake channel dir, drive
 * the REAL autonomous loop (`ChannelWatcherService.tick`) for `ticks` rounds,
 * then classify what each scenario landed as.
 */
export async function runSoak(
  scenarios: readonly SoakScenario[],
  deps: SoakDeps,
): Promise<SoakReport> {
  for (const [index, scenario] of scenarios.entries()) {
    const dir = path.join(deps.fakeDir, scenario.integrationId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `${String(index).padStart(3, "0")}-${scenario.name}.json`),
      JSON.stringify({ text: scenario.text, receivedAt: "2026-07-17T00:00:00.000Z" }),
    );
  }
  for (let i = 0; i < deps.ticks; i++) {
    await deps.tick();
    if (deps.tickDelayMs > 0) await sleep(deps.tickDelayMs);
  }
  return evaluateSoak(scenarios, await deps.listItems());
}

/** Render the report as operator-readable markdown (the soak's durable artifact). */
export function renderSoakReport(report: SoakReport): string {
  const lines = [
    "# Soak report — autonomous loop (fake-channel lane)",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Scenario | Expected tier | Actual tier | Expected state | Actual state | OK |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.results.map((r) => {
      const ok =
        r.violations.length === 0 &&
        r.actualTier === r.expectedTier &&
        r.actualState === r.expectedState;
      return `| ${r.name} | ${r.expectedTier} | ${r.actualTier ?? "—"} | ${r.expectedState} | ${r.actualState ?? "—"} | ${ok ? "✅" : "❌"} |`;
    }),
    "",
    `Handled by tier: T1=${report.handledByTier[1]} · T2=${report.handledByTier[2]} · T3=${report.handledByTier[3]}`,
    "",
    "## Violations",
    "",
    ...(report.violations.length === 0
      ? ["None — the autonomy contract held."]
      : report.violations.map((v) => `- ${v}`)),
    "",
  ];
  return lines.join("\n");
}
