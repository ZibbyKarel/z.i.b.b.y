import { execFile } from "node:child_process";
import {
  type Agent,
  type AiEngine,
  type PhaseEscalation,
  type SystemConfig,
  type WorkflowPhase,
  resolveTierModel,
} from "@zibby/contracts";
import { bluecodeProbe, bluecodeVariantIds } from "../ai-providers/bluecode-provider";
import { agentBaseEnv } from "../shared/agent-env";
import { ClaudeUnavailableError } from "./claude-preflight.service";

/** The engine (and, for opencode, the `provider/model`) one run executes on. */
export interface ResolvedAiEngine {
  engine: AiEngine;
  /** opencode only: the `provider/model` ("" = none chosen — refused by the preflight). */
  model?: string;
}

/** What a run asks to execute on: engine / exact-model overrides + the model tier. */
export type EngineTarget = Pick<Agent, "engine" | "engineModel" | "model">;

/**
 * Effective engine for a run: the target's own override ?? the global setting. On
 * opencode the model is the explicit `engineModel` ?? the tier mapped through
 * `opencodeTierModels` (A20, nearest lower, then higher tier) ?? `opencodeModel`. The
 * claude engine ignores `engineModel`; it passes the tier as `--model`. With `listed`
 * (the live catalog) a tier whose model is not listed counts as unmapped (todo-7).
 */
export function resolveAiEngine(
  target: EngineTarget,
  config:
    | (Pick<SystemConfig, "aiEngine" | "opencodeModel"> &
        Partial<Pick<SystemConfig, "opencodeTierModels">>)
    | undefined,
  listed?: readonly string[],
): ResolvedAiEngine {
  const engine = target.engine ?? config?.aiEngine ?? "claude";
  if (engine === "claude") return { engine };
  return {
    engine,
    model:
      target.engineModel ??
      resolveTierModel(
        target.model,
        config?.opencodeTierModels,
        config?.opencodeModel ?? "",
        listed,
      ),
  };
}

/**
 * The engine a run really executes on (todo-7): {@link resolveAiEngine} checked against
 * the live `opencode models` catalog, so a tier the model family lacks falls back
 * (lower first). claude and an explicit `engineModel` never probe the catalog; an
 * unreadable catalog trusts the mapping. Every run path and its preflight call this.
 */
export async function resolveRunEngine(
  target: EngineTarget,
  config: Parameters<typeof resolveAiEngine>[1],
): Promise<ResolvedAiEngine> {
  const engine = resolveAiEngine(target, config);
  if (engine.engine === "claude" || target.engineModel) return engine;
  return resolveAiEngine(target, config, (await opencodeModels()) ?? undefined);
}

/**
 * A21 — a workflow stage's target: the phase's `engine` / `engineModel` over the
 * agent's; the tier is the escalation rung's ?? the phase's ?? the agent's.
 */
export function stageEngineTarget(
  phase: Pick<WorkflowPhase, "engine" | "engineModel" | "model">,
  agent: EngineTarget,
  escalation?: PhaseEscalation | null,
): EngineTarget {
  return {
    engine: phase.engine ?? agent.engine,
    engineModel: phase.engineModel ?? agent.engineModel,
    model: escalation?.model ?? phase.model ?? agent.model,
  };
}

/**
 * Whether any attempt of the stage (the first run and every escalation rung) spends
 * the Claude subscription. A rung can map to another model, so each one counts.
 */
export function stageSpendsClaude(
  phase: Pick<WorkflowPhase, "engine" | "engineModel" | "model" | "loop">,
  agent: EngineTarget,
  resolve: (target: EngineTarget) => ResolvedAiEngine,
): boolean {
  return [null, ...(phase.loop?.escalation ?? [])].some((rung) => {
    const e = resolve(stageEngineTarget(phase, agent, rung));
    return spendsClaudeSubscription(e.engine, e.model);
  });
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
export function opencodeExec(
  args: string[],
  timeoutMs = 10_000,
  env?: Record<string, string>,
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(
        opencodeBin(),
        args,
        { timeout: timeoutMs, env: agentBaseEnv(env), maxBuffer: 16 * 1024 * 1024 },
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
export function opencodeCached(
  args: string[],
  timeoutMs?: number,
  env?: Record<string, string>,
): Promise<string | null> {
  const key = `${opencodeBin()}\0${args.join("\0")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = opencodeExec(args, timeoutMs, env);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Drop every memoised probe (tests; a fresh `opencode auth login`). */
export function clearOpencodeCache(): void {
  cache.clear();
}

/**
 * `opencode models` → `provider/model` ids, or `null` when opencode can't be run. With
 * BlueCode configured it runs `--standalone` on a config carrying the custom provider
 * (the background service would not see it); otherwise it is the plain `models`.
 */
export async function opencodeModels(): Promise<string[] | null> {
  const probe = bluecodeProbe();
  const out = probe
    ? await opencodeCached(["models", "--standalone"], 15_000, probe.env)
    : await opencodeCached(["models"], 15_000);
  if (out === null) return null;
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[^\s/]+\/\S+$/.test(line));
}

/**
 * The priced model catalog (`opencode api GET /api/model`), cached like every probe.
 * Only the background service answers it (`--standalone` returns `data: []`).
 */
export function opencodeCatalog(): Promise<string | null> {
  return opencodeCached(["api", "GET", "/api/model"], 10_000);
}

/** A catalog entry's `variants: [{ id, settings }]` → the variant ids. */
export function variantIds(variants: unknown): string[] {
  if (!Array.isArray(variants)) return [];
  return variants.flatMap((v: unknown) =>
    typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "string"
      ? [(v as { id: string }).id]
      : [],
  );
}

/**
 * A26 — an opencode run's thinking level as a model variant: when the model has no
 * explicit `#variant` and the catalog lists a variant whose id equals `thinking`, the
 * run uses `model#thinking` (`opencode run -m provider/model#variant`). An explicit
 * variant always wins; a model without a matching variant (or an unreadable catalog)
 * runs unchanged. The claude engine is returned as-is (it maps thinking to `--effort`).
 */
export async function applyThinkingVariant(
  engine: ResolvedAiEngine,
  thinking: Agent["thinking"],
): Promise<ResolvedAiEngine> {
  const model = engine.model;
  if (engine.engine !== "opencode" || !model || !thinking || model.includes("#")) return engine;
  // The standalone catalog is empty, so BlueCode's variants come from its stored snapshot.
  if (model.startsWith("bluecode/"))
    return bluecodeVariantIds(model).includes(thinking)
      ? { ...engine, model: `${model}#${thinking}` }
      : engine;
  let raw: unknown;
  try {
    raw = JSON.parse((await opencodeCatalog()) ?? "");
  } catch {
    return engine;
  }
  const data =
    typeof raw === "object" && raw !== null && Array.isArray((raw as { data?: unknown }).data)
      ? ((raw as { data: unknown[] }).data as Record<string, unknown>[])
      : [];
  const entry = data.find(
    (m) =>
      typeof m === "object" && m !== null && `${String(m.providerID)}/${String(m.id)}` === model,
  );
  return entry && variantIds(entry.variants).includes(thinking)
    ? { ...engine, model: `${model}#${thinking}` }
    : engine;
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
      "no model chosen — set Settings → AI models (opencodeModel / opencodeTierModels) or the agent's / step's engineModel",
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
      model.startsWith("bluecode/")
        ? `model "${model}" is not in BlueCode's model list — refresh or re-save it in Settings → AI models → BlueCode`
        : `model "${model}" is not in \`opencode models\` — connect its provider with \`opencode auth login\``,
    );
  }
}
