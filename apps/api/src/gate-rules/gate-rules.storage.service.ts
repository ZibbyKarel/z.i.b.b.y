import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import {
  GATE_RULE_ID_REGEX,
  type GlobalGateRule,
  type GlobalGateRuleInput,
  GlobalGateRuleSchema,
} from "@zibby/contracts"
import { collisionResistantId, ensureDir, fileExists, safeJson, writeFileAtomic } from "../shared/file-storage"
import { GateRuleNotFoundError, InvalidGateRuleIdError } from "./gate-rules.errors"

/** DI token carrying the absolute path of the directory that holds the catalog file. */
export const GATE_RULES_DIR = "GATE_RULES_DIR"

const FILE = "gate-rules.json"

/**
 * Durable persistence for the global gate-rule catalog: a single ordered
 * `gate-rules.json` (the list order is the evaluation order — first match wins, so
 * it is meaningful and must round-trip exactly). Tolerant parse (a single corrupt
 * rule is dropped, never fatal to the catalog) and atomic writes, mirroring the
 * other file-backed stores. Seeded with a conservative default catalog on first run.
 */
@Injectable()
export class GateRulesStorageService implements OnModuleInit {
  private readonly dir: string

  constructor(@Inject(GATE_RULES_DIR) dir: string) {
    this.dir = path.resolve(dir)
  }

  async onModuleInit(): Promise<void> {
    await ensureDir(this.dir)
    if (!(await fileExists(this.file))) await this.persist(DEFAULT_CATALOG)
  }

  /** The whole catalog, in order. A single malformed rule is skipped, not fatal. */
  async list(): Promise<GlobalGateRule[]> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null)
    if (raw === null) return [...DEFAULT_CATALOG]
    const parsed = safeJson(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_CATALOG]
    const rules: GlobalGateRule[] = []
    for (const item of parsed) {
      const rule = GlobalGateRuleSchema.safeParse(item)
      if (rule.success) rules.push(rule.data)
    }
    return rules
  }

  /** Append a new rule to the catalog; the server assigns a stable, unique id. */
  async create(input: GlobalGateRuleInput): Promise<GlobalGateRule> {
    const rules = await this.list()
    const rule: GlobalGateRule = { ...input, id: collisionResistantId("gr") }
    await this.persist([...rules, rule])
    return rule
  }

  /** Replace a rule's editable core in place (keeps its id and position). */
  async update(id: string, input: GlobalGateRuleInput): Promise<GlobalGateRule> {
    this.assertValidId(id)
    const rules = await this.list()
    const index = rules.findIndex((r) => r.id === id)
    if (index === -1) throw new GateRuleNotFoundError(id)
    const updated: GlobalGateRule = { ...input, id }
    const next = [...rules]
    next[index] = updated
    await this.persist(next)
    return updated
  }

  /** Remove a rule from the catalog. */
  async remove(id: string): Promise<void> {
    this.assertValidId(id)
    const rules = await this.list()
    if (!rules.some((r) => r.id === id)) throw new GateRuleNotFoundError(id)
    await this.persist(rules.filter((r) => r.id !== id))
  }

  /**
   * Reorder the catalog by a full list of ids. `ids` must be a permutation of the
   * current ids — a mismatch (missing/extra/unknown id) is rejected so a stale
   * client can never silently drop or duplicate a rule.
   */
  async reorder(ids: string[]): Promise<GlobalGateRule[] | null> {
    const rules = await this.list()
    if (ids.length !== rules.length) return null
    const byId = new Map(rules.map((r) => [r.id, r]))
    const next: GlobalGateRule[] = []
    for (const id of ids) {
      const rule = byId.get(id)
      if (!rule || next.includes(rule)) return null
      next.push(rule)
    }
    await this.persist(next)
    return next
  }

  private get file(): string {
    return path.join(this.dir, FILE)
  }

  private assertValidId(id: string): void {
    if (!GATE_RULE_ID_REGEX.test(id)) throw new InvalidGateRuleIdError(id)
  }

  private async persist(rules: GlobalGateRule[]): Promise<void> {
    await ensureDir(this.dir)
    await writeFileAtomic(this.file, JSON.stringify(rules, null, 2))
  }
}

/**
 * A conservative starter catalog expressed with the matchers the engine supports
 * (action/threshold/scope/context/tool). The ids are stable so seeded agents/skills
 * can reference them via `gateRuleIds`.
 */
const DEFAULT_CATALOG: GlobalGateRule[] = [
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
]
