import type { Decision, GateRule, MatchCondition, Resolve } from "@zibby/contracts";
import type { IconName, TagTone } from "@zibby/design-system";

/**
 * The gate engine (chat 6 — the newest design): a rule is `matcher → decision
 * (→ resolve, only for "ask")`. Risk is a property of (action, args/target,
 * context), not of a tool. The locked system floor (`POLICY.md`) may only be
 * hardened by an agent's own rules. Evaluated top-down; first match wins.
 */

export interface DecisionMeta {
  tone: TagTone;
  icon: IconName;
  cssVar: string;
}

/** allow=quiet, notify=log, ask=GATED (pause→ask), deny=never. */
export const DECISION_META: Record<Decision, DecisionMeta> = {
  allow: { tone: "ok", icon: "check", cssVar: "var(--color-ok)" },
  notify: { tone: "accent", icon: "pulse", cssVar: "var(--color-accent)" },
  ask: { tone: "warn", icon: "shield", cssVar: "var(--color-warn)" },
  deny: { tone: "bad", icon: "x", cssVar: "var(--color-bad)" },
};

export const DECISION_ORDER: Decision[] = ["allow", "notify", "ask", "deny"];

export type MatchType = MatchCondition["type"];

export const MATCHER_ICON: Record<MatchType, IconName> = {
  tool: "code",
  action: "bolt",
  threshold: "pulse",
  scope: "branch",
  context: "compass",
};

export const MATCH_TYPE_ORDER: MatchType[] = ["tool", "action", "threshold", "scope", "context"];

/** A short human string for one match condition (the value is the emphasized part). */
export function matchText(c: MatchCondition): {
  lead: string;
  pattern: string;
} {
  switch (c.type) {
    case "tool":
      return { lead: "tool", pattern: c.tool };
    case "action":
      return { lead: c.action, pattern: c.branch ?? "" };
    case "threshold":
      return { lead: `${c.metric} ${c.op}`, pattern: String(c.value) };
    case "scope":
      return { lead: "scope", pattern: c.scope };
    case "context":
      return { lead: "context", pattern: c.context };
  }
}

/** Flatten a resolve tree into chips + the combining mode (for display). */
export interface ResolveLeaf {
  kind: "human" | "check" | "agent";
  name?: string;
}

export function flattenResolve(r: Resolve | undefined): {
  leaves: ResolveLeaf[];
  mode: "all" | "any";
} {
  if (!r) return { leaves: [], mode: "all" };
  if (r.type === "all")
    return {
      leaves: r.all.flatMap((x) => flattenResolve(x).leaves),
      mode: "all",
    };
  if (r.type === "any")
    return {
      leaves: r.any.flatMap((x) => flattenResolve(x).leaves),
      mode: "any",
    };
  if (r.type === "human") return { leaves: [{ kind: "human" }], mode: "all" };
  if (r.type === "check") return { leaves: [{ kind: "check", name: r.check }], mode: "all" };
  return { leaves: [{ kind: "agent", name: r.agent }], mode: "all" };
}

/** A stable client id for a fresh own-rule (server assigns the real id). */
export function freshRuleId(): string {
  return `own-${Math.random().toString(36).slice(2, 9)}`;
}

export type EditableRule = Pick<GateRule, "id" | "match" | "decision" | "resolve">;
