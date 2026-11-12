import { Injectable } from "@nestjs/common";
import type { AiEngineModel, AiEngines, AiProvidersUsage, AiUsage } from "@zibby/contracts";
import { opencodeCached, opencodeModels } from "../runner/ai-engine";
import { ClaudePreflightService } from "../runner/claude-preflight.service";

/**
 * The run engines' status (`GET /ai-providers/engines`) and opencode's per-model usage
 * (`GET /ai-providers/usage`). Every probe shells out with a short timeout and is
 * cached ~1 minute (see `opencodeCached`); nothing here throws — an engine that can't
 * be probed reports `available: false`.
 */
@Injectable()
export class AiEnginesService {
  constructor(private readonly claude: ClaudePreflightService) {}

  async engines(): Promise<AiEngines> {
    const [claude, version, models, auth, catalog] = await Promise.all([
      this.claude.probe().catch(() => ({ ok: false as const, version: undefined })),
      opencodeCached(["--version"], 5_000),
      opencodeModels(),
      opencodeCached(["auth", "list", "--format", "json"], 5_000),
      // The priced catalog. Only the background service answers it (`--standalone`
      // returns `data: []`); when it can't be read every model falls back to the id rule.
      opencodeCached(["api", "GET", "/api/model"], 10_000),
    ]);
    const available = version !== null && models !== null;
    return {
      engines: [
        {
          id: "claude",
          available: claude.ok,
          ...(claude.version ? { version: claude.version } : {}),
        },
        {
          id: "opencode",
          available,
          ...(version ? { version: version.trim() } : {}),
          ...(available
            ? {
                providers: parseProviders(auth, models),
                models: markFree(models, freeInCatalog(catalog)),
              }
            : {}),
        },
      ],
    };
  }

  async usage(days: number): Promise<AiProvidersUsage> {
    const out = await opencodeCached(STATS_ARGS(days), 15_000);
    return { days, opencode: mapOpencodeStats(out) };
  }
}

const STATS_ARGS = (days: number) => ["stats", "--json", "--days", String(days), "--models"];

/**
 * `opencode api GET /api/model` → `provider/model` → its price tags. Free only when the
 * provider is the built-in `opencode` one AND the catalog lists a `cost` AND every
 * price component is 0 — a missing or partial price is not free. Subscription when the
 * provider is `claude-agent` and `cost` is an empty array (a Claude Code login; an
 * API-key login lists prices). `null` when the catalog can't be read.
 */
export function freeInCatalog(out: string | null): Map<string, Omit<AiEngineModel, "id">> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(out ?? "");
  } catch {
    return null;
  }
  const data = isRecord(raw) && Array.isArray(raw.data) ? raw.data.filter(isRecord) : [];
  if (!data.length) return null;
  const zero = (v: unknown): boolean => v === 0;
  const free = new Map<string, Omit<AiEngineModel, "id">>();
  for (const m of data) {
    const provider = str(m.providerID);
    const costs = Array.isArray(m.cost) ? m.cost : [];
    const allZero =
      costs.length > 0 &&
      costs.every(
        (c) =>
          isRecord(c) &&
          zero(c.input) &&
          zero(c.output) &&
          isRecord(c.cache) &&
          zero(c.cache.read) &&
          zero(c.cache.write),
      );
    free.set(`${provider}/${str(m.id)}`, {
      free: provider === "opencode" && allZero,
      subscription: provider === "claude-agent" && Array.isArray(m.cost) && !m.cost.length,
    });
  }
  return free;
}

/**
 * Tag each model `free` from the priced catalog ({@link freeInCatalog}). A model the
 * catalog doesn't list (or no catalog at all) is free only by the `opencode/…-free`
 * id convention and never a subscription; anything else counts as paid.
 */
export function markFree(
  models: readonly string[],
  catalog: Map<string, Omit<AiEngineModel, "id">> | null,
): AiEngineModel[] {
  return models.map((id) => ({
    id,
    ...(catalog?.get(id) ?? {
      free: id.startsWith("opencode/") && id.endsWith("-free"),
      subscription: false,
    }),
  }));
}

/**
 * Providers opencode can use: the logged-in ones from `auth list` (a JSON array whose
 * entries' shape is unverified — strings or `{id|provider|name}`), plus every provider
 * prefix in the model list (covers the built-in free `opencode` provider).
 */
export function parseProviders(authJson: string | null, models: readonly string[]): string[] {
  const ids = new Set(models.map((m) => m.split("/")[0] ?? m));
  try {
    const parsed: unknown = JSON.parse(authJson ?? "[]");
    if (Array.isArray(parsed)) {
      for (const e of parsed) {
        const id =
          typeof e === "string"
            ? e
            : e && typeof e === "object"
              ? (["id", "provider", "providerID", "name"] as const)
                  .map((k) => (e as Record<string, unknown>)[k])
                  .find((v) => typeof v === "string")
              : undefined;
        if (typeof id === "string" && id) ids.add(id);
      }
    }
  } catch {
    // unreadable auth listing → model prefixes only
  }
  return [...ids].sort();
}

const ZERO: AiUsage = {
  steps: 0,
  costUsd: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
};

/** `opencode stats --json --models` → the contract's usage block (zeros when unreadable). */
export function mapOpencodeStats(out: string | null): AiProvidersUsage["opencode"] {
  if (out === null) return { available: false, totals: ZERO, models: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(out);
  } catch {
    return { available: false, totals: ZERO, models: [] };
  }
  const rec = isRecord(raw) ? raw : {};
  const models = Array.isArray(rec.models) ? rec.models.filter(isRecord) : [];
  return {
    available: true,
    totals: toUsage(rec),
    models: models.map((m) => {
      const model = isRecord(m.model) ? m.model : {};
      return {
        providerId: str(model.providerID),
        modelId: str(model.id),
        ...(typeof model.variant === "string" && model.variant ? { variant: model.variant } : {}),
        ...toUsage(m),
      };
    }),
  };
}

function toUsage(r: Record<string, unknown>): AiUsage {
  const t = isRecord(r.tokens) ? r.tokens : {};
  const cache = isRecord(t.cache) ? t.cache : {};
  return {
    steps: num(r.steps),
    costUsd: num(r.cost),
    tokens: {
      input: num(t.input),
      output: num(t.output),
      reasoning: num(t.reasoning),
      cacheRead: num(cache.read),
      cacheWrite: num(cache.write),
    },
  };
}

const num = (v: unknown): number => (typeof v === "number" && v > 0 ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
