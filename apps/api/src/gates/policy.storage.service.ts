import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import { type GateRule, GateRuleSchema } from "@zibby/contracts"
import matter from "gray-matter"

/** DI token for the directory holding the locked system policy floor (`POLICY.md`). */
export const POLICY_DIR = "POLICY_DIR"

const FILE = "POLICY.md"

/**
 * The system policy floor: a single locked `POLICY.md` whose frontmatter carries
 * `policy: GateRule[]`. It is the structural enforcement of "ZIBBY never
 * autonomously completes a transactional action" — agents may only *harden* it.
 * Storage-service pattern: tolerant parse (a single malformed rule is dropped, not
 * the whole floor), seeded with a conservative default on first run.
 */
@Injectable()
export class PolicyStorageService implements OnModuleInit {
  private readonly dir: string

  constructor(@Inject(POLICY_DIR) dir: string) {
    this.dir = path.resolve(dir)
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    if (!(await this.exists())) await this.seed()
  }

  /** The locked floor rules. Always tagged `source: "system", locked: true`. */
  async floor(): Promise<GateRule[]> {
    const raw = await fs.readFile(path.join(this.dir, FILE), "utf8").catch(() => null)
    if (raw === null) return DEFAULT_FLOOR
    let data: Record<string, unknown>
    try {
      data = matter(raw).data as Record<string, unknown>
    } catch {
      return DEFAULT_FLOOR
    }
    const list = Array.isArray(data.policy) ? data.policy : []
    const rules: GateRule[] = []
    for (const item of list) {
      // Force the locked-system provenance regardless of what's on disk.
      const parsed = GateRuleSchema.safeParse({
        ...(item as object),
        source: "system",
        locked: true,
      })
      if (parsed.success) rules.push(parsed.data)
    }
    return rules.length > 0 ? rules : DEFAULT_FLOOR
  }

  private async exists(): Promise<boolean> {
    return fs
      .access(path.join(this.dir, FILE))
      .then(() => true)
      .catch(() => false)
  }

  private async seed(): Promise<void> {
    const body = matter.stringify(
      "\nSystem policy floor. Agents may only harden these rules.\n",
      { policy: DEFAULT_FLOOR },
    )
    await fs.writeFile(path.join(this.dir, FILE), body, "utf8").catch(() => {})
  }
}

/** A conservative default floor: money/destructive/outbound actions need a human. */
const DEFAULT_FLOOR: GateRule[] = (
  ["purchase", "payment", "git.force_push", "send_email", "delete"] as const
).map((action) => ({
  id: `floor-${action}`,
  source: "system" as const,
  locked: true,
  match: [{ type: "action" as const, action }],
  decision: "ask" as const,
  resolve: { type: "human" as const },
}))
