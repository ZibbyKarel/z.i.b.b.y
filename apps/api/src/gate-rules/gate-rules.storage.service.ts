import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  GATE_RULE_ID_REGEX,
  type GlobalGateRule,
  type GlobalGateRuleInput,
  GlobalGateRuleSchema,
} from "@zibby/contracts";
import {
  collisionResistantId,
  ensureDir,
  fileExists,
  safeJson,
  writeFileAtomic,
} from "../shared/file-storage";
import {
  GateRuleNotFoundError,
  InvalidGateRuleIdError,
  SystemGateRuleError,
} from "./gate-rules.errors";

/** DI token carrying the absolute path of the directory that holds the catalog file. */
export const GATE_RULES_DIR = "GATE_RULES_DIR";

const FILE = "gate-rules.json";

/**
 * Durable persistence for the global gate rules: a single ordered `gate-rules.json`
 * holding the built-in {@link SYSTEM_RULES} (the former `POLICY.md` floor) and the
 * operator's own rules. Order only matters inside a department's bucket (first match
 * wins there); the untagged global bucket takes the strictest match. A system rule
 * can be edited or moved to another decision, never deleted: one missing from the
 * file (hand-edited) is put back on every read. Tolerant parse (a single corrupt
 * rule is dropped, never fatal) and atomic writes, mirroring the other file-backed
 * stores. Seeded with the system rules + a starter catalog on first run.
 */
@Injectable()
export class GateRulesStorageService implements OnModuleInit {
  private readonly dir: string;

  constructor(@Inject(GATE_RULES_DIR) dir: string) {
    this.dir = path.resolve(dir);
  }

  async onModuleInit(): Promise<void> {
    await ensureDir(this.dir);
    if (!(await fileExists(this.file))) await this.persist(DEFAULT_CATALOG);
    else if ((await this.readFile()).length < (await this.list()).length) {
      await this.persist(await this.list()); // a system rule was missing: the file stays the truth.
    }
  }

  /**
   * The whole list, in order, system rules flagged `system: true`; a missing system
   * rule is put back in front. A single malformed rule is skipped, not fatal.
   */
  async list(): Promise<GlobalGateRule[]> {
    const rules = await this.readFile();
    const ids = new Set(rules.map((r) => r.id));
    return [...SYSTEM_RULES.filter((r) => !ids.has(r.id)), ...rules].map((r) =>
      isSystemGateRule(r.id) ? { ...r, system: true } : r,
    );
  }

  private async readFile(): Promise<GlobalGateRule[]> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return [...DEFAULT_CATALOG];
    const parsed = safeJson(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_CATALOG];
    const rules: GlobalGateRule[] = [];
    for (const item of parsed) {
      const rule = GlobalGateRuleSchema.safeParse(item);
      if (rule.success) rules.push(rule.data);
    }
    return rules;
  }

  /** Append a new rule to the catalog; the server assigns a stable, unique id. */
  async create(input: GlobalGateRuleInput): Promise<GlobalGateRule> {
    const rules = await this.list();
    const rule: GlobalGateRule = { ...input, id: collisionResistantId("gr") };
    await this.persist([...rules, rule]);
    return rule;
  }

  /** Replace a rule's editable core in place (keeps its id and position). */
  async update(id: string, input: GlobalGateRuleInput): Promise<GlobalGateRule> {
    this.assertValidId(id);
    const rules = await this.list();
    const index = rules.findIndex((r) => r.id === id);
    if (index === -1) throw new GateRuleNotFoundError(id);
    const updated: GlobalGateRule = isSystemGateRule(id)
      ? { ...input, id, system: true }
      : { ...input, id };
    const next = [...rules];
    next[index] = updated;
    await this.persist(next);
    return updated;
  }

  /** Remove a rule from the catalog. A system rule can't be removed (move it to allow). */
  async remove(id: string): Promise<void> {
    this.assertValidId(id);
    if (isSystemGateRule(id)) throw new SystemGateRuleError(id);
    const rules = await this.list();
    if (!rules.some((r) => r.id === id)) throw new GateRuleNotFoundError(id);
    await this.persist(rules.filter((r) => r.id !== id));
  }

  /**
   * Reorder the catalog by a full list of ids. `ids` must be a permutation of the
   * current ids — a mismatch (missing/extra/unknown id) is rejected so a stale
   * client can never silently drop or duplicate a rule.
   */
  async reorder(ids: string[]): Promise<GlobalGateRule[] | null> {
    const rules = await this.list();
    if (ids.length !== rules.length) return null;
    const byId = new Map(rules.map((r) => [r.id, r]));
    const next: GlobalGateRule[] = [];
    for (const id of ids) {
      const rule = byId.get(id);
      if (!rule || next.includes(rule)) return null;
      next.push(rule);
    }
    await this.persist(next);
    return next;
  }

  private get file(): string {
    return path.join(this.dir, FILE);
  }

  private assertValidId(id: string): void {
    if (!GATE_RULE_ID_REGEX.test(id)) throw new InvalidGateRuleIdError(id);
  }

  private async persist(rules: GlobalGateRule[]): Promise<void> {
    await ensureDir(this.dir);
    // `system` is derived from the id, never stored.
    const stored = rules.map((rule) => {
      const copy = { ...rule };
      delete copy.system;
      return copy;
    });
    await writeFileAtomic(this.file, JSON.stringify(stored, null, 2));
  }
}

const ask = (action: string, name: string, desc: string): GlobalGateRule => ({
  id: `floor-${action}`,
  name,
  desc,
  match: [{ type: "action", action }],
  decision: "ask",
  resolve: { type: "human" },
});

const notify = (action: string, name: string, desc: string): GlobalGateRule => ({
  id: `floor-${action}`,
  name,
  desc,
  match: [{ type: "action", action }],
  decision: "notify",
});

/**
 * The built-in system rules — the former locked `POLICY.md` floor, now ordinary
 * global rules the operator can edit or move to another decision (`allow` switches
 * one off), but never delete. Defaults: money / destructive / outbound / git-publish
 * actions ask a human; `pr.merge` is a deny (merging is "Never" in the autonomy
 * contract). `agent.delegate`, `channel-reply` and `pr.open` are explicit `notify`
 * entries (Tier-1/Tier-2, logged) so they don't fall through to the fail-closed
 * `ask` an unmatched action gets. The `floor-` ids are kept stable: approvals and the
 * activity feed reference them.
 */
export const SYSTEM_RULES: GlobalGateRule[] = [
  ask("purchase", "Nákup", "Jakýkoli nákup čeká na tvé potvrzení."),
  ask("payment", "Platba", "Platba odchází až po tvém schválení."),
  ask("git.force_push", "Force push", "Force push přepisuje historii — vždy se zeptá."),
  ask("git.push", "Push", "Push do vzdálené větve se nejdřív zeptá."),
  ask(
    "gh.api_write",
    "Zápis přes GitHub API",
    "Zápis přes GitHub API (labely, nastavení…) potřebuje souhlas.",
  ),
  // Phase 4 — the narrow comment/review class split out of gh.api_write (same default),
  // so autopilot can cover PR comments without touching the rest of the GitHub API.
  ask(
    "gh.pr_comment",
    "Komentář na GitHubu",
    "Komentář, odpověď nebo review na PR čeká na tvůj souhlas.",
  ),
  ask("send_email", "Odeslání e-mailu", "Odeslání e-mailu jde přes tebe."),
  ask("delete", "Mazání", "Mazání se neprovede bez tvého potvrzení."),
  // Off by default (operator call, 2026-10-22): agents mostly rewrite their own files.
  {
    id: "floor-overwrite",
    name: "Přepis souboru",
    desc: "Přepis existujícího souboru proběhne bez ptaní.",
    match: [{ type: "action", action: "overwrite" }],
    decision: "allow",
  },
  ask("move", "Přesun souboru", "Přesun nebo přejmenování souboru čeká na tvé potvrzení."),
  ask(
    "jira.create_issue",
    "Založení Jira issue",
    "Založení Jira issue je zápis ven — čeká na schválení.",
  ),
  ask("spend-past-cap", "Útrata nad rozpočet", "Útrata nad rozpočet projektu se musí schválit."),
  ask("agent.propose_new", "Nový agent", "Aktivace nově navrženého agenta čeká na tebe."),
  ask("deploy", "Deploy", "Nasazení se nikdy nespustí samo."),
  ask("operator.question", "Otázka na tebe", "Otázka agenta na tebe — odpovědět můžeš jen ty."),
  {
    id: "floor-pr.merge",
    name: "Merge PR",
    desc: "Merge PR ZIBBY nikdy neprovede sám.",
    match: [{ type: "action", action: "pr.merge" }],
    decision: "deny",
  },
  notify("channel-reply", "Odpověď do kanálu", "Odpověď do kanálu se pošle a zaloguje."),
  notify("agent.delegate", "Předání subagentovi", "Předání práce subagentovi se jen zaloguje."),
  notify("pr.open", "Otevření PR", "Otevření PR proběhne samo a objeví se v briefingu."),
];

const SYSTEM_RULE_IDS = new Set(SYSTEM_RULES.map((r) => r.id));

/** Whether `id` names a built-in system rule (not deletable). */
export function isSystemGateRule(id: string): boolean {
  return SYSTEM_RULE_IDS.has(id);
}

/**
 * A conservative starter catalog expressed with the matchers the engine supports
 * (action/threshold/scope/context/tool). The ids are stable so seeded agents/skills
 * can reference them via `gateRuleIds`.
 */
const STARTER_CATALOG: GlobalGateRule[] = [
  {
    id: "gr-push-main",
    name: "Push do main",
    desc: "Přímý push do hlavní větve vždy projde tvým schválením.",
    match: [{ type: "action", action: "git.push", branch: "main" }],
    decision: "ask",
    resolve: { type: "human" },
  },
  {
    id: "gr-merge",
    name: "Merge PR",
    desc: "Sloučení až po zelené CI a tvém potvrzení.",
    match: [{ type: "action", action: "merge" }],
    decision: "ask",
    resolve: { type: "all", all: [{ type: "check", check: "ci_green" }, { type: "human" }] },
  },
  {
    id: "gr-deploy-work",
    name: "Deploy nechá zrevidovat",
    desc: "Nasazení zreviduje agent reviewer, než se provede.",
    match: [{ type: "action", action: "deploy" }],
    decision: "ask",
    resolve: { type: "agent", agent: "reviewer" },
  },
  {
    id: "gr-feature-push",
    name: "Push do feature větve",
    desc: "Bezpečné — provede se a jen zaloguje do activity feedu.",
    match: [{ type: "scope", scope: "feature/*" }],
    decision: "notify",
  },
  {
    id: "gr-big-purchase",
    name: "Velký nákup",
    desc: "Nákup nad 500 Kč potřebuje tvé potvrzení.",
    match: [{ type: "threshold", metric: "purchase.amount", op: "gt", value: 500 }],
    decision: "ask",
    resolve: { type: "human" },
  },
];

const DEFAULT_CATALOG: GlobalGateRule[] = [...SYSTEM_RULES, ...STARTER_CATALOG];
