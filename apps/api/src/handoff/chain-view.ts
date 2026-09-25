import type {
  Chain,
  ChainInput,
  ChainStep,
  DepartmentId,
  HandoffRule,
  HandoffSignalKind,
} from "@zibby/contracts";

/**
 * ZB-05a / D-005 — pure helpers over the existing handoff stores: a chain is a
 * VIEW derived from a `chain: true` signal kind plus the rules that carry its
 * id as `signalKind`, not a separate store. Nothing here touches disk — the
 * callers (`ChainsService`, `HandoffService`) own the store reads/writes.
 */

/** A chain can have at most this many hops (D-005). */
export const MAX_CHAIN_STEPS = 11;

/**
 * Walk from `kind.entry` along the enabled-or-not rules whose `signalKind` is
 * this kind's own id, one hop per rule `{from: X} -> {to: department Y}`. Stops
 * at the first missing hop, a non-department target, or a repeated department
 * (cycle guard — `chainToRules`/`validateChainInput` never produce one, but a
 * hand-edited rules file could). Returns `null` for a non-chain kind (no
 * `chain: true`) or one missing its `entry`.
 *
 * `enabled` is true only when the route resolved to at least one step AND
 * every rule on it is enabled — a chain's PUT always writes its rules
 * uniformly enabled/disabled together (see {@link chainToRules}), so a mixed
 * result only happens via a hand-edited file (read as "disabled": don't
 * dispatch a half-toggled route).
 */
export function deriveChain(kind: HandoffSignalKind, rules: readonly HandoffRule[]): Chain | null {
  if (kind.chain !== true || !kind.entry) return null;
  const chainRules = rules.filter((r) => r.signalKind === kind.id);
  const steps: ChainStep[] = [];
  const seen = new Set<DepartmentId>([kind.entry]);
  let current: DepartmentId = kind.entry;
  for (let i = 0; i < MAX_CHAIN_STEPS; i += 1) {
    const rule = chainRules.find((r) => r.from === current);
    if (!rule || rule.to.kind !== "department" || seen.has(rule.to.id)) break;
    steps.push({ department: rule.to.id, gate: rule.tier === 3 ? "ask" : "auto", ruleId: rule.id });
    seen.add(rule.to.id);
    current = rule.to.id;
  }
  const enabled =
    steps.length > 0 && steps.every((s) => chainRules.find((r) => r.id === s.ruleId)?.enabled);
  return {
    id: kind.id,
    label: kind.label,
    description: kind.description,
    entry: kind.entry,
    steps,
    enabled,
  };
}

/**
 * Validate an operator-authored chain shape BEFORE it is ever turned into
 * rules: linear (one hop per department — guaranteed by the acyclic check
 * below, since a repeated `from` would require a repeated department), acyclic
 * (`entry` + every step's department all distinct) and 1–{@link MAX_CHAIN_STEPS}
 * steps (already enforced by `ChainInputSchema.steps`'s `min`/`max`, re-checked
 * here so a hand-built input still gets a clear message). Department-only
 * targets are guaranteed structurally by `ChainStepInputSchema.department`'s
 * type. Returns a human-readable problem, or `null` when the input is valid.
 */
export function validateChainInput(input: ChainInput): string | null {
  if (input.steps.length < 1 || input.steps.length > MAX_CHAIN_STEPS) {
    return `A chain needs 1–${MAX_CHAIN_STEPS} steps.`;
  }
  const path: DepartmentId[] = [input.entry, ...input.steps.map((s) => s.department)];
  const seen = new Set<DepartmentId>();
  for (const department of path) {
    if (seen.has(department)) return `Chain has a cycle at department "${department}".`;
    seen.add(department);
  }
  return null;
}

/**
 * Turn a validated {@link ChainInput} into the rule rows a chain PUT writes —
 * one rule per hop, from the department that just finished to the step's
 * department. Deterministic ids (`${chainId}:${index}`, 0-based) rather than a
 * random generator: this stays a PURE function (no id minting side effect),
 * and the same input always produces the same rows (idempotent re-PUT).
 * `gate: "auto"` maps to tier 2 (act, then report); `"ask"` to tier 3 (a
 * `handoff-proposal` approval) — O-05. Every rule of one chain is written
 * `enabled` in lockstep with the chain's own top-level flag (see
 * {@link deriveChain}'s `enabled` derivation).
 */
export function chainToRules(chainId: string, input: ChainInput): HandoffRule[] {
  const path: DepartmentId[] = [input.entry, ...input.steps.map((s) => s.department)];
  return input.steps.map((step, i) => ({
    id: `${chainId}:${i}`,
    from: path[i] as DepartmentId,
    signalKind: chainId,
    to: { kind: "department", id: step.department },
    tier: step.gate === "ask" ? (3 as const) : (2 as const),
    enabled: input.enabled,
    system: false,
  }));
}
