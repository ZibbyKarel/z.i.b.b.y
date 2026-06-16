import { spawn } from "node:child_process"
import { Injectable } from "@nestjs/common"
import { z } from "zod"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"

/** How long the headless `claude -p` distiller may take before we fall back. */
const DISTILLER_TIMEOUT_MS = 30_000

/** A finished run reduced to what the distiller model needs to see. */
export interface RunDigest {
  kind: "pipeline" | "agent" | "goal"
  /** The run id (forensic; the model shouldn't echo it back as a learning). */
  id: string
  /** pipelineId / agentId / goalId — the reusable identity. */
  name: string
  status: string
  /** Resolved project id, when the run targeted one. */
  project?: string
  /** A short, already-truncated excerpt of the run's key artifact/log. */
  excerpt: string
}

/** One durable learning the model extracted from the batch. */
export interface Learning {
  title: string
  body: string
}

const LearningSchema = z.object({
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(1500),
})
const DistillSchema = z.object({ learnings: z.array(LearningSchema).max(12) }).strict()

const DISTILLER_SYSTEM_PROMPT = [
  "You are ZIBBY's memory distiller. You are given a batch of FINISHED runs",
  "(pipelines, agents, goals) with short excerpts of their outputs. Extract only",
  "DURABLE, REUSABLE learnings about the projects or domain that will still be true",
  "next time: conventions, architectural decisions, recurring gotchas, constraints.",
  "Do NOT restate run-specific changelog, numbers, commit ids, or what a single run",
  "did — that is episodic and belongs elsewhere. Merge duplicates across runs into",
  "one learning. If nothing durable stands out, return an empty list.",
  "",
  'Reply with ONLY a JSON object, no prose and no code fences:',
  '{"learnings":[{"title":string,"body":string}]}',
].join("\n")

/**
 * The cheap-model pass of the nightly memory distillation. Copies
 * {@link ClaudeCliBriefer}'s shape EXACTLY — `--model haiku --output-format json`,
 * the SAME `process.env.VITEST` guard so tests never spawn claude, envelope-unwrap +
 * fence-tolerant parse, strict-schema validation — and NEVER blocks: any failure
 * returns `[]` and the caller files no digest. It only ever sees the run excerpts
 * the service already assembled and capped (never raw inbound channel text).
 */
@Injectable()
export class ClaudeCliDistiller {
  private readonly log: ScopedLogger

  constructor(logger: LoggerService) {
    this.log = logger.child(ClaudeCliDistiller.name)
  }

  /** Returns the extracted learnings, or [] to file no digest. */
  async distill(runs: RunDigest[]): Promise<Learning[]> {
    if (process.env.VITEST) return []
    if (runs.length === 0) return []

    let raw: string
    try {
      raw = await this.runClaude(this.buildPrompt(runs))
    } catch (err) {
      this.log.debug("distiller CLI call failed", { error: (err as Error).message })
      return []
    }

    const obj = this.parse(raw)
    if (!obj) return []
    const parsed = DistillSchema.safeParse(obj)
    if (!parsed.success) {
      this.log.debug("distiller output failed schema (rejected)", {})
      return []
    }
    return parsed.data.learnings
  }

  private buildPrompt(runs: RunDigest[]): string {
    const compact = runs.map((r) => ({
      kind: r.kind,
      name: r.name,
      status: r.status,
      ...(r.project ? { project: r.project } : {}),
      excerpt: r.excerpt,
    }))
    return [DISTILLER_SYSTEM_PROMPT, "", "RUNS:", JSON.stringify(compact)].join("\n")
  }

  protected runClaude(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.env.CLAUDE_BIN ?? "claude",
        ["-p", prompt, "--output-format", "json", "--model", "haiku"],
        { stdio: ["ignore", "pipe", "pipe"] },
      )

      let stdout = ""
      let stderr = ""
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`distiller timed out after ${DISTILLER_TIMEOUT_MS}ms`))
      }, DISTILLER_TIMEOUT_MS)
      timer.unref?.()

      child.stdout?.on("data", (buf: Buffer) => {
        stdout += buf.toString("utf8")
      })
      child.stderr?.on("data", (buf: Buffer) => {
        stderr += buf.toString("utf8")
      })
      child.on("error", (err) => {
        clearTimeout(timer)
        reject(err)
      })
      child.on("exit", (code) => {
        clearTimeout(timer)
        if (code === 0) resolve(stdout)
        else reject(new Error(`claude exited ${code}: ${stderr.slice(0, 200)}`))
      })
    })
  }

  /** Unwrap the `{ result }` envelope and parse the inner JSON (fence-tolerant). */
  private parse(raw: string): unknown {
    const inner = this.extractResultText(raw)
    if (inner === null) return null
    const start = inner.indexOf("{")
    const end = inner.lastIndexOf("}")
    if (start === -1 || end <= start) return null
    try {
      return JSON.parse(inner.slice(start, end + 1))
    } catch {
      return null
    }
  }

  private extractResultText(raw: string): string | null {
    const trimmed = raw.trim()
    if (trimmed.length === 0) return null
    try {
      const envelope = JSON.parse(trimmed) as { result?: unknown }
      if (typeof envelope.result === "string") return envelope.result
      if (envelope && typeof envelope === "object" && "learnings" in envelope) return trimmed
    } catch {
      // Not JSON — treat the raw text as the candidate.
    }
    return trimmed
  }
}
