import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type Automation,
  AutomationSchema,
  type CreateAutomationInput,
  type UpdateAutomationInput,
} from "@zibby/contracts";
import { EntityFileStore, searchByText } from "../shared/file-storage";

export const AUTOMATIONS_DIR = "AUTOMATIONS_DIR";

export class AutomationNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Automation "${id}" not found`);
    this.name = "AutomationNotFoundError";
  }
}
export class AutomationConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Automation "${id}" already exists`);
    this.name = "AutomationConflictError";
  }
}
export class InvalidAutomationIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid automation id: "${id}"`);
    this.name = "InvalidAutomationIdError";
  }
}
/** A system automation is seeded by ZIBBY: it can't be deleted, and only its
 *  schedule (`trigger`) and `enabled` state may be edited. Both routes surface
 *  this as a 409. */
export class SystemAutomationError extends Error {
  constructor(public readonly id: string) {
    super(
      `Automation "${id}" is a system automation — it cannot be deleted, only rescheduled or toggled`,
    );
    this.name = "SystemAutomationError";
  }
}

/** Stable id of the nightly memory-distillation system automation. */
export const MEMORY_DISTILL_AUTOMATION_ID = "memory-distill";
/** Stable id of the nightly self-knowledge-refresh system automation (F4c). */
export const SELF_KNOWLEDGE_AUTOMATION_ID = "self-knowledge-refresh";
/** Stable id of the nightly vault-lint system automation. */
export const VAULT_LINT_AUTOMATION_ID = "vault-lint";
/** Stable id of the weekly Security security-scan system automation (F5a). */
export const SECURITY_SCAN_AUTOMATION_ID = "security-scan";
/** Stable id of the nightly Arch quality-audit system automation (F5c). */
export const ARCH_AUDIT_AUTOMATION_ID = "arch-audit";
/** Stable id of the post-merge CI-watch system automation (NS2 F7b-2). */
export const POST_MERGE_WATCH_AUTOMATION_ID = "post-merge-watch";
/** Stable id of the nightly PR-review-learning system automation (v1). */
export const REVIEW_LEARN_AUTOMATION_ID = "review-learn";

/**
 * System automations ZIBBY owns and seeds on boot. They embody capabilities that
 * are the *system's*, not an agent's or the operator's — so they can't be deleted,
 * only rescheduled. Memory distillation is the canonical one: agents stay
 * memory-blind, and learning-from-runs runs here as infrastructure. (Phase 116a:
 * `discovery`/`research-digest`/`app-ideas` were retired — the operator now
 * targets the `code-audit`/`research` workflows directly for that work instead.)
 */
export const SYSTEM_AUTOMATIONS: readonly Automation[] = [
  {
    id: "morning-briefing",
    name: "Ranní briefing",
    description:
      "Každé ráno sestaví briefing z aktivit, běhů a paměti a doručí ho do Tasků — co se stalo a co čeká na tebe.",
    trigger: { type: "cron", expr: "0 7 * * *" },
    target: { type: "briefing" },
    enabled: true,
    system: true,
  },
  {
    id: MEMORY_DISTILL_AUTOMATION_ID,
    name: "Destilace paměti",
    description:
      "Noční průchod dokončenými běhy — levný model z nich vydestiluje trvalé poznatky do vaultu.",
    trigger: { type: "cron", expr: "0 3 * * *" },
    target: { type: "memory-distill" },
    enabled: true,
    system: true,
  },
  {
    id: "nightly-patterns",
    name: "Extrakce vzorů",
    description:
      "Projde 30 dní schvalovacích rozhodnutí, najde opakované vzory a navrhne z nich pravidla do vaultu pro briefing.",
    trigger: { type: "cron", expr: "0 23 * * *" },
    target: { type: "pattern-extract" },
    enabled: true,
    system: true,
  },
  {
    id: "gap-detect",
    name: "Návrhy na automatizaci",
    description:
      "Sleduje opakovaně zadávané ruční tasky a navrhne, co by šlo automatizovat. Sám nic nevytváří.",
    trigger: { type: "cron", expr: "0 23 * * *" },
    target: { type: "gap-detect" },
    enabled: false,
    system: true,
  },
  {
    id: REVIEW_LEARN_AUTOMATION_ID,
    name: "Učení z review",
    description:
      "Stáhne review komentáře z PR, které ZIBBY otevřel, a vydestiluje z nich kandidátní pravidla; při druhém výskytu je předloží ke schválení.",
    // 3:15 — after the 3:00 distill, before the 3:30 self-knowledge refresh.
    trigger: { type: "cron", expr: "15 3 * * *" },
    target: { type: "review-learn" },
    // Off by default: it costs GitHub calls and a model pass per project, so the
    // operator turns it on per engagement (the gap-detect/agent-factory posture).
    enabled: false,
    system: true,
  },
  {
    id: "agent-factory",
    name: "Továrna agentů",
    description:
      "Hledá opakované běhy přes orchestrator-fallback, kde chybí specialista, a navrhne nového agenta (čeká na schválení).",
    trigger: { type: "cron", expr: "0 4 * * 1" },
    target: { type: "agent-factory" },
    enabled: false,
    system: true,
  },
  {
    id: SELF_KNOWLEDGE_AUTOMATION_ID,
    name: "Obnova sebeznalosti",
    description:
      "Každou noc přegeneruje vault poznámku o sobě samém — agenty, workflow, pravidla gate a kanály.",
    // 3:30 — after the 3:00 distill, before the 7:00 briefing.
    trigger: { type: "cron", expr: "30 3 * * *" },
    target: { type: "self-knowledge" },
    enabled: true,
    system: true,
  },
  {
    id: VAULT_LINT_AUTOMATION_ID,
    name: "Lint vaultu",
    description:
      "Noční kontrola vaultu: rozbité odkazy, osiřelé a zastaralé poznámky, bujení tagů. Jen report, nic nemění.",
    trigger: { type: "cron", expr: "30 3 * * *" },
    target: { type: "vault-lint" },
    enabled: true,
    system: true,
  },
  {
    // NS2 F5a — Security's weekly security watch. Seeded `enabled: true` (charter
    // duty 6, orchestrator addendum ruling #3): fail-open no-op on a green system,
    // so waking it by default makes the chair real without risk.
    id: SECURITY_SCAN_AUTOMATION_ID,
    name: "Bezpečnostní hlídka",
    description:
      "Týdně projde Dependabot alerty a hledá úniky secretů v repozitářích projektů; na kritickou CVE připraví opravu přes gate.",
    trigger: { type: "cron", expr: "0 5 * * 1" },
    target: { type: "security-scan" },
    enabled: true,
    system: true,
  },
  {
    // NS2 F5c — Arch's nightly quality audit. Seeded `enabled: true` (same
    // reasoning as Security above): fail-open no-op on a green system.
    id: ARCH_AUDIT_AUTOMATION_ID,
    name: "Noční audit kvality",
    description:
      "Noční audit kódu ZIBBY: změny god-nodů a komunit v grafu a cyklické závislosti. Nálezy jdou do vaultu a briefingu.",
    trigger: { type: "cron", expr: "0 2 * * *" },
    target: { type: "arch-audit" },
    enabled: true,
    system: true,
  },
  {
    // NS2 F7b-2 — the post-merge CI watch. Seeded `enabled: true` (orchestrator
    // addendum ruling #2): frequent (every 10 min) but bounded by each watch's own
    // deadline and per-watch try/catch, so a huge backlog degrades gracefully.
    id: POST_MERGE_WATCH_AUTOMATION_ID,
    name: "Sledování po sloučení",
    description:
      "Každých 10 minut zkontroluje CI na cílové větvi po merge, který ZIBBY provedl; při červené připraví opravu.",
    trigger: { type: "cron", expr: "*/10 * * * *" },
    target: { type: "post-merge-watch" },
    enabled: true,
    system: true,
  },
  // Signal-triggered system automations (replace the retired handoff rules). Each hands
  // the emitting department's finding to Dev as a task; the signal's title+body is
  // appended to `text` at dispatch. `approval: "ask"` parks a Tier-3 approval first.
  {
    id: "signal-cve-critical",
    name: "Kritická CVE → Dev",
    description:
      "Když Security nahlásí kritickou CVE, předá ji Devu jako task na opravu ve vlastní větvi.",
    trigger: { type: "signal", kind: "cve", from: "sec", minSeverity: "critical" },
    target: {
      type: "task",
      text: "Prepare a fix for this critical vulnerability on its own branch. Do not push or merge — the PR is the gate.",
      target: { kind: "department", id: "dev", name: "dev" },
    },
    enabled: true,
    system: true,
  },
  {
    id: "signal-post-merge-red",
    name: "Červené CI po sloučení → Dev",
    description: "Když CI po sloučení zčervená, předá to Devu jako task na prošetření a opravu.",
    trigger: { type: "signal", kind: "post-merge-red", from: "rel" },
    target: {
      type: "task",
      text: "Investigate the failing CI run and prepare a fix on its own branch. Do not push or merge — the PR is the gate.",
      target: { kind: "department", id: "dev", name: "dev" },
    },
    enabled: true,
    system: true,
  },
  {
    id: "signal-arch-audit",
    name: "Nálezy auditu architektury → Dev",
    description: "Předá nálezy auditu architektury Devu k opravě — až po tvém schválení.",
    trigger: { type: "signal", kind: "audit-batch", from: "qa" },
    target: {
      type: "task",
      text: "Review these architecture findings and prepare the worthwhile fixes on their own branch.",
      target: { kind: "department", id: "dev", name: "dev" },
    },
    approval: "ask",
    enabled: true,
    system: true,
  },
  {
    // TODO 13 — a QA-owned workflow's delivered findings (e.g. web-qa's
    // qa-findings.md) → a Dev task. Parks a Tier-3 approval first.
    id: "signal-qa-findings",
    name: "Nálezy QA → Dev",
    description: "Předá nálezy QA Devu, aby je reprodukoval a opravil — až po tvém schválení.",
    trigger: { type: "signal", kind: "qa-findings", from: "qa" },
    target: {
      type: "task",
      text: "Review these QA findings, reproduce each one, and prepare fixes for the confirmed defects on their own branch. Do not push or merge — the PR is the gate.",
      target: { kind: "department", id: "dev", name: "dev" },
    },
    approval: "ask",
    enabled: true,
    system: true,
  },
  {
    id: "signal-research",
    name: "Výsledek výzkumu → Dev",
    description: "Předá dokončený výzkum z R&D Devu, aby na něm stavěl — až po tvém schválení.",
    trigger: { type: "signal", kind: "research-artifact", from: "rnd" },
    target: {
      type: "task",
      text: "Build on this delivered research.",
      target: { kind: "department", id: "dev", name: "dev" },
    },
    approval: "ask",
    enabled: true,
    system: true,
  },
];

/** Durable, file-backed persistence for automations — one `<id>.json` each. */
@Injectable()
export class AutomationsStorageService extends EntityFileStore<Automation> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = AGENT_ID_REGEX;

  constructor(@Inject(AUTOMATIONS_DIR) dir: string) {
    super(dir);
  }

  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    await this.seedSystem();
  }

  /**
   * Ensure every system automation exists, self-healing on each boot: create the
   * ones missing, and re-assert the server-owned fields (`system`, `target`, `name`, `description`)
   * on the ones present — while preserving the operator's `trigger`, `enabled` and
   * `lastFiredAt` from disk (those are theirs to keep across restarts).
   */
  private async seedSystem(): Promise<void> {
    for (const def of SYSTEM_AUTOMATIONS) {
      let existing: Automation | null = null;
      try {
        existing = await this.get(def.id);
      } catch (error) {
        if (!(error instanceof AutomationNotFoundError)) throw error;
      }
      if (!existing) {
        await this.writeEntity({ ...def });
        continue;
      }
      const healed: Automation = {
        ...existing,
        name: def.name,
        description: def.description,
        target: def.target,
        system: true,
      };
      if (this.serialize(existing) !== this.serialize(healed)) await this.writeEntity(healed);
    }
  }

  async create(input: CreateAutomationInput): Promise<Automation> {
    const file = this.resolveFile(input.id);
    if (await this.fileExists(file)) throw new AutomationConflictError(input.id);
    // `system` is server-owned — never settable through create.
    const automation: Automation = { ...input, system: false };
    await this.writeEntity(automation);
    return automation;
  }

  async update(id: string, patch: UpdateAutomationInput): Promise<Automation> {
    return this.updateEntity(id, (existing) => {
      // System automations allow only a reschedule or an enable/disable toggle —
      // any change to `target`/`name`/`prompt` etc. is refused.
      if (existing.system) {
        const touchesLockedField = Object.entries(patch).some(
          ([key, value]) => key !== "trigger" && key !== "enabled" && value !== undefined,
        );
        if (touchesLockedField) throw new SystemAutomationError(id);
      }
      return { ...existing, ...patch, id: existing.id, system: existing.system };
    });
  }

  /** Refuse to delete a system automation (it is rescheduling-only). */
  override async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (existing.system) throw new SystemAutomationError(id);
    await super.delete(id);
  }

  /** Free-text search over automations by id and name. */
  async search(query: string): Promise<Automation[]> {
    return searchByText(await this.list(), query, (a) => [a.id, a.name]);
  }

  /** Stamp the last-fired time (idempotence + display); separate from user updates. */
  async markFired(id: string, at: string): Promise<Automation> {
    return this.updateEntity(id, (existing) => ({ ...existing, lastFiredAt: at }));
  }

  protected idOf(automation: Automation): string {
    return automation.id;
  }

  protected serialize(automation: Automation): string {
    return JSON.stringify(automation);
  }

  protected tryParse(raw: string): Automation | null {
    return this.parseJson(AutomationSchema, raw);
  }

  protected compare(a: Automation, b: Automation): number {
    return a.id.localeCompare(b.id);
  }

  protected notFound(id: string): Error {
    return new AutomationNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidAutomationIdError(id);
  }
}
