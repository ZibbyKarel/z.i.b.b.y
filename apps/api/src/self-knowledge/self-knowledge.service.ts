import { Inject, Injectable } from "@nestjs/common";
import { promises as fs } from "node:fs";
import {
  IntegrationKindSchema,
  type Note,
  SUBSYSTEMS,
  type SelfKnowledge,
} from "@zibby/contracts";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { GateRulesStorageService } from "../gate-rules/gate-rules.storage.service";
import { PolicyStorageService } from "../gates/policy.storage.service";
import { NoteNotFoundError, VaultService } from "../memory/vault.service";
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import {
  type SelfKnowledgeComposerInput,
  composeSelfKnowledge,
  computeDrift,
  mergeAutoBlocks,
} from "./self-knowledge.composer";
import { type ParsedGraphReport, parseGraphReport } from "./graph-report.parser";

/** Fixed vault note id/tier/title — the one durable self-knowledge note. */
export const SELF_KNOWLEDGE_NOTE_ID = "self-knowledge";
const SELF_KNOWLEDGE_TIER = "knowledge" as const;
const SELF_KNOWLEDGE_TITLE = "Self-Knowledge";

/**
 * DI token carrying the absolute path to graphify's `GRAPH_REPORT.md` (Fáze 10).
 * Default resolved by `resolveGraphReportPath()` in `self-knowledge.module.ts`;
 * tests inject their own (typically a path inside an isolated temp dir).
 */
export const GRAPH_REPORT_PATH = "GRAPH_REPORT_PATH";

/**
 * Composes, persists and drift-checks the self-knowledge note (Fáze 1). Reads
 * the same read-through stores the rest of the app reads (agents/pipelines
 * hot-reload already works — see `docs/plans/phase-06.md` Zjištění 2), so a newly
 * added `.md` agent or pipeline is reflected the next time this composes,
 * without a restart.
 *
 * Channel kinds are NOT read from a live adapter registry — `AdapterRegistry`
 * (`channels/adapters/adapter-registry.ts`) is a `switch` over `Integration["kind"]`
 * with no enumerable list, and pulling in `ChannelsModule` here would mean this
 * module depends on integrations/tasks/gates/approvals transitively for a plain
 * string list. `IntegrationKindSchema.options` (the exact set the registry
 * switches on) is the already-exported single source of truth for those kind
 * strings, so it is reused here rather than duplicating them.
 *
 * Fáze 10 adds one more read, straight off disk rather than through a storage
 * service: graphify's `graphify-out/GRAPH_REPORT.md`. That directory is
 * entirely gitignored and machine-local (never committed — see
 * `docs/plans/phase-10-graphify-self-knowledge.md`'s "Rozhodnutí"), so the file
 * routinely does not exist; any read failure (missing, unreadable, whatever)
 * is treated as "codebase shape not available" rather than propagated.
 */
@Injectable()
export class SelfKnowledgeService {
  constructor(
    private readonly agents: AgentsStorageService,
    private readonly pipelines: PipelinesStorageService,
    private readonly gateRules: GateRulesStorageService,
    private readonly policy: PolicyStorageService,
    private readonly vault: VaultService,
    @Inject(GRAPH_REPORT_PATH) private readonly graphReportPath: string,
  ) {}

  /** Read + parse `GRAPH_REPORT.md`; any failure at all (missing, unreadable, …) → `null`. */
  private async readCodebaseShape(): Promise<ParsedGraphReport | null> {
    try {
      const raw = await fs.readFile(this.graphReportPath, "utf8");
      return parseGraphReport(raw);
    } catch {
      return null;
    }
  }

  private async gather(): Promise<SelfKnowledgeComposerInput> {
    const [agents, pipelines, gateRules, policyFloor, codebaseShape] = await Promise.all([
      this.agents.list(),
      this.pipelines.list(),
      this.gateRules.list(),
      this.policy.floor(),
      this.readCodebaseShape(),
    ]);
    return {
      agents,
      pipelines,
      subsystems: [...SUBSYSTEMS],
      gateRules,
      policyFloor,
      channelKinds: [...IntegrationKindSchema.options],
      codebaseShape,
    };
  }

  private async readExistingNote(): Promise<Note | null> {
    try {
      return await this.vault.note(SELF_KNOWLEDGE_NOTE_ID);
    } catch (error) {
      if (error instanceof NoteNotFoundError) return null;
      throw error;
    }
  }

  /**
   * Fresh compose against the live catalog + a drift check against the current
   * vault note (missing note = drift). This is exactly the `SelfKnowledgeSchema`
   * shape, so the controller returns it directly.
   */
  async compose(): Promise<SelfKnowledge> {
    const input = await this.gather();
    const generated = composeSelfKnowledge(input);
    const existing = await this.readExistingNote();
    const drift = existing ? computeDrift(existing.body ?? "", generated.markdown) : true;
    return {
      markdown: generated.markdown,
      generatedAt: generated.generatedAt,
      sections: generated.sections,
      drift,
    };
  }

  /**
   * Create-or-update the vault note: a brand-new note gets the freshly composed
   * body verbatim; an existing note is merged so any operator content outside
   * the AUTO blocks survives.
   */
  async write(): Promise<Note> {
    const { markdown } = await this.compose();
    const existing = await this.readExistingNote();
    if (!existing) {
      return this.vault.createNote({
        id: SELF_KNOWLEDGE_NOTE_ID,
        tier: SELF_KNOWLEDGE_TIER,
        title: SELF_KNOWLEDGE_TITLE,
        body: markdown,
      });
    }
    const merged = mergeAutoBlocks(existing.body ?? "", markdown);
    return this.vault.updateNote(SELF_KNOWLEDGE_NOTE_ID, { body: merged });
  }

  /** Whether the current vault note has drifted from a fresh compose. */
  async check(): Promise<boolean> {
    const { drift } = await this.compose();
    return drift;
  }
}
