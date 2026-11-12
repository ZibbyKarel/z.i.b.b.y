import { execFile } from "node:child_process";
import type { Agent, AiEngine, SystemConfig } from "@zibby/contracts";
import { agentBaseEnv } from "../shared/agent-env";
import { ClaudeUnavailableError } from "./claude-preflight.service";

/** The engine (and, for opencode, the `provider/model`) one run executes on. */
export interface ResolvedAiEngine {
  engine: AiEngine;
  /** opencode only: the `provider/model` ("" = none chosen — refused by the preflight). */
  model?: string;
}

/**
 * Effective engine for a run: the agent's own override ?? the global setting. On
 * opencode the model is the agent's `engineModel` ?? `SystemConfig.opencodeModel`;
 * the claude engine ignores `engineModel` (it keeps using `agent.model`).
 */
export function resolveAiEngine(
  agent: Pick<Agent, "engine" | "engineModel">,
  config: Pick<SystemConfig, "aiEngine" | "opencodeModel"> | undefined,
): ResolvedAiEngine {
  const engine = agent.engine ?? config?.aiEngine ?? "claude";
  if (engine === "claude") return { engine };
  return { engine, model: agent.engineModel ?? config?.opencodeModel ?? "" };
}

/**
 * The run spends the operator's Claude subscription, so Claude's 5h / weekly window
 * applies (A18): the native claude engine (absent = a run from before engines), or
 * opencode on its `claude-agent/*` provider (Claude Code login through the Agent SDK).
 */
export function spendsClaudeSubscription(engine: AiEngine | undefined, model?: string): boolean {
  return engine !== "opencode" || !!model?.startsWith("claude-agent/");
}

/** `OPENCODE_BIN` is the test seam (mirrors `CLAUDE_BIN`); production runs `opencode`. */
export function opencodeBin(): string {
  return process.env.OPENCODE_BIN ?? "opencode";
}

/** Run `opencode <args>`; stdout on exit 0, `null` on anything else (missing, timeout, error). */
export function opencodeExec(args: string[], timeoutMs = 10_000): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(
        opencodeBin(),
        args,
        { timeout: timeoutMs, env: agentBaseEnv(), maxBuffer: 16 * 1024 * 1024 },
        (error, stdout) => resolve(error ? null : stdout),
      );
    } catch {
      resolve(null);
    }
  });
}

/** How long a probe result (version / models / auth / stats) is reused. */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: Promise<string | null> }>();

/**
 * {@link opencodeExec}, memoised for {@link CACHE_TTL_MS} per binary + args. A failed
 * probe is cached too, so a missing binary is not re-spawned on every request.
 */
export function opencodeCached(args: string[], timeoutMs?: number): Promise<string | null> {
  const key = `${opencodeBin()}\0${args.join("\0")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = opencodeExec(args, timeoutMs);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Drop every memoised probe (tests; a fresh `opencode auth login`). */
export function clearOpencodeCache(): void {
  cache.clear();
}

/** `opencode models` → `provider/model` ids, or `null` when opencode can't be run. */
export async function opencodeModels(): Promise<string[] | null> {
  const out = await opencodeCached(["models"], 15_000);
  if (out === null) return null;
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[^\s/]+\/\S+$/.test(line));
}

/**
 * Thrown when an opencode run is refused up front (A7: binary missing, no model,
 * model unknown). Subclasses {@link ClaudeUnavailableError} only so the existing
 * 503 / failed-task mapping applies; the message names opencode.
 */
export class OpencodeUnavailableError extends ClaudeUnavailableError {
  constructor(reason: string) {
    super(reason);
    this.name = "OpencodeUnavailableError";
    this.message = `opencode unavailable: ${reason}`;
  }
}

/** Refuse an opencode run that cannot start. Never falls back to Claude (A7). */
export async function assertOpencodeReady(model: string | undefined): Promise<void> {
  if (!model) {
    throw new OpencodeUnavailableError(
      "no model chosen — set Settings → AI models (opencodeModel) or the agent's engineModel",
    );
  }
  const models = await opencodeModels();
  if (models === null) {
    throw new OpencodeUnavailableError(
      `\`${opencodeBin()} models\` failed — is opencode installed?`,
    );
  }
  // A `#variant` suffix selects a model variant; the listing has the bare id.
  if (!models.includes(model.split("#")[0] ?? model)) {
    throw new OpencodeUnavailableError(
      `model "${model}" is not in \`opencode models\` — connect its provider with \`opencode auth login\``,
    );
  }
}
