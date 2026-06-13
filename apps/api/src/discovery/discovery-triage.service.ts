import { spawn } from "node:child_process"
import { Injectable } from "@nestjs/common"
import { type Candidate, CandidateSchema, type Project } from "@zibby/contracts"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"
import { VaultService } from "../memory/vault.service"
import { ProjectsStorageService } from "../projects/projects.storage.service"
import { ProposalsStorageService } from "./proposals.storage.service"
import { ProposedTaskFlowService } from "./proposed-task-flow.service"

/** Trailing chars of a failing-check log kept as the candidate's context. */
const TAIL_MAX = 1500

/**
 * The discovery scanner (Phase 10.3) — work finds itself. `run(now)` scans
 * deterministic signals (a registered project's declared `checks` exit status; the
 * `- [ ]` open items in `MEMORY.md`), turns them into work CANDIDATES, validates
 * each against the CLOSED {@link CandidateSchema} (Law 4 — a candidate is inert
 * data, never a gate override), persists each as a proposal and PARKS it behind a
 * `proposed-task` approval. *Proposed ≠ dispatched*: nothing is started here — only
 * an operator approval dispatches.
 *
 * Scanned repo/vault content is wrapped as quoted DATA in the candidate text. An
 * optional claude refinement pass could slot in after the deterministic scan
 * (validated against the same closed schema); the deterministic path is the floor.
 */
@Injectable()
export class DiscoveryTriageService {
  private readonly log: ScopedLogger

  constructor(
    private readonly projects: ProjectsStorageService,
    private readonly vault: VaultService,
    private readonly proposals: ProposalsStorageService,
    private readonly flow: ProposedTaskFlowService,
    logger: LoggerService,
  ) {
    this.log = logger.child(DiscoveryTriageService.name)
  }

  /** Scan signals → candidates → parked proposals. Returns the parked proposal ids. */
  async run(now: Date = new Date()): Promise<string[]> {
    const candidates = [...(await this.scanFailingChecks()), ...(await this.scanMemoryOpenItems())]
    const parked: string[] = []
    for (const raw of candidates) {
      // Defensive re-validation: a candidate that doesn't fit the closed schema is
      // DROPPED — it can never carry an action/gate/tier (Law 4).
      const valid = CandidateSchema.safeParse(raw)
      if (!valid.success) {
        this.log.warn("discovery candidate dropped (schema)", { issue: valid.error.issues[0]?.message })
        continue
      }
      const proposal = await this.proposals.create({
        id: this.proposals.newId(),
        candidate: valid.data,
        state: "proposed",
        createdAt: now.toISOString(),
      })
      await this.flow.park(proposal)
      parked.push(proposal.id)
    }
    this.log.info("discovery triage run", { candidates: candidates.length, parked: parked.length })
    return parked
  }

  /** Run each project's DECLARED checks (opt-in); a non-zero exit → a fix candidate. */
  private async scanFailingChecks(): Promise<Candidate[]> {
    const projects = await this.projects.list().catch((): Project[] => [])
    const out: Candidate[] = []
    for (const project of projects) {
      if (!project.checks?.length) continue // opt-in: never autorun checks on undeclared repos
      const { code, output } = await this.runShell(project.checks.join(" && "), project.path)
      if (code === 0) continue
      const tail = output.length > TAIL_MAX ? output.slice(output.length - TAIL_MAX) : output
      out.push({
        title: `Fix failing checks in ${project.name}`,
        // Scanned output is quoted DATA, never instructions.
        text: `The declared checks for project "${project.name}" are failing. Investigate and fix them.\n\nFailing output:\n"""\n${tail}\n"""`,
        rationale: `Project "${project.name}" checks exited non-zero`,
        confidence: 0.8,
      })
    }
    return out
  }

  /** Each `- [ ]` open item in `MEMORY.md` → a candidate (the item text as quoted data). */
  private async scanMemoryOpenItems(): Promise<Candidate[]> {
    const note = await this.vault.note("MEMORY").catch(() => null)
    if (!note?.body) return []
    const items = note.body
      .split(/\r?\n/)
      .map((l) => /^\s*-\s*\[ \]\s+(.+)$/.exec(l)?.[1]?.trim())
      .filter((t): t is string => Boolean(t))
    return items.map((item) => ({
      title: item.length > 80 ? `${item.slice(0, 79)}…` : item,
      // The open-item text is quoted DATA — an injection-shaped line stays inert.
      text: `Open item from MEMORY.md:\n"""\n${item}\n"""`,
      rationale: "Open item in MEMORY.md",
      confidence: 0.5,
    }))
  }

  /** Run a shell command, capturing combined output and the exit code. */
  private runShell(command: string, cwd: string): Promise<{ code: number; output: string }> {
    return new Promise((resolve) => {
      let output = ""
      const child = spawn("/bin/sh", ["-c", command], { cwd, stdio: ["ignore", "pipe", "pipe"] })
      child.stdout.on("data", (d) => (output += d.toString()))
      child.stderr.on("data", (d) => (output += d.toString()))
      child.on("error", (err) => resolve({ code: 1, output: `${output}\n${err.message}` }))
      child.on("close", (code) => resolve({ code: code ?? 1, output }))
    })
  }
}
