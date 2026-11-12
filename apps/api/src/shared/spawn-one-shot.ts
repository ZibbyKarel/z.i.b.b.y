import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Agent, AiEngine, ModelTier, SystemConfig } from "@zibby/contracts";
import { applyThinkingVariant, opencodeBin, resolveAiEngine } from "../runner/ai-engine";
import {
  APPROVAL_HOOK,
  GATE_DEADLINE_S,
  OPENCODE_GATE_PLUGIN,
  opencodeToolRules,
} from "../runner/claude-run-command.service";
import { extractOpencodeCost } from "../runner/opencode-stream-format";
import { GRANT_DIRS_ENV, agentSpawnEnv } from "../runner/runner-core";
import { spawnClaudeCli } from "./spawn-claude-cli";

/** The opencode agent a one-shot's system prompt is defined under. */
const ONE_SHOT_AGENT = "zibby-oneshot";
const ONE_SHOT_SYSTEM =
  "You are a headless helper inside ZibbyOS. Do exactly what the user message asks and reply with only what it asks for.";

/** What a one-shot may touch on opencode (the claude path keeps its caller's own argv). */
export type OneShotTools =
  /** No tool at all (every classify/summarize call). */
  | "none"
  /** Read/Grep/Glob inside `cwd` only; any other path is denied (`external_directory`). */
  | "read-cwd"
  /** Read/Grep/Glob anywhere except the operator-token dir (the approval hook guards it). */
  | "read-guarded";

export interface SpawnOneShotOptions {
  /** Model tier; the claude engine passes it as `--model`, opencode maps it (A20). */
  tier: ModelTier;
  prompt: string;
  timeoutMs: number;
  /** Caller id in error messages, e.g. "router". */
  label: string;
  /** The live system config (engine + tier mapping); absent = native claude. */
  config:
    | (Pick<SystemConfig, "aiEngine" | "opencodeModel"> &
        Partial<Pick<SystemConfig, "opencodeTierModels">>)
    | undefined;
  /** Forces the engine (the advisor follows its stage); default = `config.aiEngine`. */
  engine?: AiEngine;
  /** claude only: argv after `-p <prompt> --output-format json --model <tier>`. */
  claudeArgs?: string[];
  /** opencode only, default `"none"`. */
  tools?: OneShotTools;
  /** Working dir (the reply researcher's repo, the advisor's worktree). */
  cwd?: string;
  /** opencode only: thinking level as a model variant (A26). */
  thinking?: Agent["thinking"];
  /** opencode only: fork this session first (`--session <id> --fork`). */
  forkSession?: string;
}

/**
 * The engine-aware one-shot (A32). On claude it is exactly the old `spawnClaudeCli`
 * call. On opencode it runs `opencode run --standalone --format json` with a per-call
 * config (0600, temp dir, deleted after) and returns the same `{ result }` envelope the
 * claude CLI prints (plus `total_cost_usd`, `session_id`), so every caller's parser is
 * unchanged. Rejects on an `error` event, a non-zero exit, the timeout or empty text.
 */
export async function spawnOneShot(opts: SpawnOneShotOptions): Promise<string> {
  const engine = resolveAiEngine({ engine: opts.engine, model: opts.tier }, opts.config);
  if (engine.engine === "claude") {
    return spawnClaudeCli({
      args: [
        "-p",
        opts.prompt,
        "--output-format",
        "json",
        "--model",
        opts.tier,
        ...(opts.claudeArgs ?? []),
      ],
      timeoutMs: opts.timeoutMs,
      label: opts.label,
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
    });
  }
  // Tests pin a fake binary; never reach the real (possibly paid) opencode from vitest.
  if (process.env.VITEST && !process.env.OPENCODE_BIN) {
    throw new Error(`${opts.label}: opencode one-shot under vitest needs OPENCODE_BIN`);
  }
  const { model } = await applyThinkingVariant(engine, opts.thinking);
  if (!model) throw new Error(`${opts.label}: no opencode model for tier ${opts.tier}`);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-oneshot-"));
  try {
    const call = oneShotOpencodeCall({ ...opts, model, dir });
    await fs.writeFile(call.files.config, call.config, { mode: 0o600 });
    const stdout = await spawnClaudeCli({
      args: call.args,
      timeoutMs: opts.timeoutMs,
      label: opts.label,
      cwd: call.cwd,
      bin: { command: opencodeBin(), env: call.env },
    });
    return JSON.stringify(parseOpencodeOneShot(stdout, opts.label));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** argv, env and config of one opencode one-shot (pure; exported for tests). */
export function oneShotOpencodeCall(
  opts: Pick<SpawnOneShotOptions, "prompt" | "tools" | "cwd" | "forkSession"> & {
    model: string;
    dir: string;
  },
) {
  const tools = opts.tools ?? "none";
  const cwd = opts.cwd ?? opts.dir;
  const files = {
    config: path.join(opts.dir, "config.json"),
    gateLog: path.join(opts.dir, "gate.log"),
  };
  const read = ["read", "list", "glob", "grep"];
  const config = {
    agents: { [ONE_SHOT_AGENT]: { mode: "primary", system: ONE_SHOT_SYSTEM } },
    permissions: [
      { action: "*", resource: "*", effect: "deny" },
      ...(tools === "none"
        ? []
        : read.map((action) => ({ action, resource: "*", effect: "allow" }))),
      {
        action: "external_directory",
        resource: "*",
        effect: tools === "read-guarded" ? "allow" : "deny",
      },
    ],
    // The gate plugin runs the approval hook on every read: it denies the operator-token
    // dir (the same guard `readGuardSettings` gives the claude advisor).
    ...(tools === "none" ? {} : { plugins: [OPENCODE_GATE_PLUGIN] }),
  };
  const gateEnv: Record<string, string> =
    tools === "none"
      ? {}
      : {
          ZIBBY_GATE_NODE: process.execPath,
          ZIBBY_GATE_HOOK: APPROVAL_HOOK,
          ZIBBY_GATE_DEADLINE_S: String(GATE_DEADLINE_S),
          [GRANT_DIRS_ENV]: "",
          ZIBBY_MCP_SERVERS: "",
          ZIBBY_MCP_REGISTRY: "",
          ZIBBY_DENY_TOOLS: opencodeToolRules(["Read"]).deny.join(","),
          ZIBBY_SHELL_PREFIXES: "",
        };
  const args = [
    "run",
    "--standalone",
    "--archived",
    "--format",
    "json",
    "-m",
    opts.model,
    "--agent",
    ONE_SHOT_AGENT,
    ...(opts.forkSession ? ["--session", opts.forkSession, "--fork"] : []),
    "--",
    opts.prompt,
  ];
  // agentSpawnEnv: no inherited OPENCODE_*, project config off, PWD pinned to `cwd`;
  // the hook's intent dir is the temp dir, never the project.
  const env = agentSpawnEnv(
    { cwd: opts.dir, spawnCwd: cwd, args: [], env: gateEnv, engine: "opencode" },
    files,
  );
  return { args, env, cwd, files, config: JSON.stringify(config) };
}

/**
 * `opencode run --format json` stdout → the claude CLI's envelope. Like claude's
 * `result`, the text is the LAST assistant step's text (its `text` parts joined): a
 * "let me look…" step before a tool call never leaks into the answer. Cost = the sum
 * of `step_finish` costs (0 on `claude-agent/*`: a subscription, not a price).
 */
export function parseOpencodeOneShot(
  stdout: string,
  label: string,
): { result: string; total_cost_usd: number; session_id?: string } {
  let text = "";
  let cost = 0;
  let sessionId: string | undefined;
  let freshStep = false;
  for (const line of stdout.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    let event: { type?: unknown; sessionID?: unknown; part?: { text?: unknown }; error?: unknown };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue;
    }
    if (typeof event.sessionID === "string") sessionId ??= event.sessionID;
    if (event.type === "error") {
      const err = event.error as { message?: unknown; data?: { message?: unknown } } | undefined;
      throw new Error(
        `${label}: opencode error: ${String(err?.data?.message ?? err?.message ?? "unknown")}`,
      );
    }
    if (event.type === "step_start") freshStep = true;
    if (event.type === "text" && typeof event.part?.text === "string") {
      if (freshStep) text = "";
      freshStep = false;
      text += event.part.text;
    }
    cost += extractOpencodeCost(line) ?? 0;
  }
  if (!text.trim()) throw new Error(`${label}: opencode produced no text`);
  return { result: text, total_cost_usd: cost, ...(sessionId ? { session_id: sessionId } : {}) };
}
