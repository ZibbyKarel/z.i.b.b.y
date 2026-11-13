import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { dataDir } from "../shared/data-dir";

/** The gitignored dir holding global AI provider keys (`AI_PROVIDERS_DIR` wins). */
export function aiProvidersDir(): string {
  return process.env.AI_PROVIDERS_DIR ?? dataDir("ai-providers");
}

/** Model ids end up in `-m bluecode/<id>`: no whitespace, slashes or `#`. */
export const BLUECODE_MODEL_ID = /^[\w.:-]+$/;

const plain = z.record(z.string(), z.unknown());
/** A field of the wrong shape is dropped, never fails the whole save. */
const soft = <T extends z.ZodTypeAny>(t: T) => t.optional().catch(undefined);

/**
 * One model of the gateway's catalog, allowlisted: unknown keys (`headers`, `options`,
 * `provider`, `npm`, … — a remote must not inject provider settings) are stripped.
 */
export const BlueCodeModelSchema = z
  .object({
    name: soft(z.string()),
    limit: soft(plain),
    modalities: soft(plain),
    capabilities: soft(plain),
    reasoning: soft(z.boolean()),
    tool_call: soft(z.boolean()),
    attachment: soft(z.boolean()),
    temperature: soft(z.boolean()),
    cost: soft(plain),
    variants: soft(z.record(z.string(), plain)),
  })
  .strip();

export const BlueCodeModelsSchema = z
  .record(z.string(), BlueCodeModelSchema)
  .refine((m) => Object.keys(m).every((id) => BLUECODE_MODEL_ID.test(id)), {
    message: "invalid model id",
  });

const StoredSchema = z.object({
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
  models: z.record(z.string(), z.record(z.string(), z.unknown())),
});
export type BlueCodeStored = z.infer<typeof StoredSchema>;

export const BLUECODE_FILE = "bluecode.json";

/** The stored BlueCode config, or `undefined` when absent / malformed. Sync: config builders are. */
export function readBlueCode(dir = aiProvidersDir()): BlueCodeStored | undefined {
  try {
    const parsed = StoredSchema.safeParse(
      JSON.parse(readFileSync(path.join(dir, BLUECODE_FILE), "utf8")),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * BlueCode (team.blue's OpenAI-compatible gateway) as an opencode custom provider: a
 * `{ provider: { bluecode: … } }` part to spread into a per-run opencode config; `{}`
 * when not configured.
 * ponytail: the model list is a snapshot taken at save time; re-saving refreshes it.
 */
export function bluecodeConfigPart(dir?: string): { provider?: Record<string, unknown> } {
  const stored = readBlueCode(dir);
  return stored ? providerPart(stored) : {};
}

/** The `provider` part for an already-read config (the store writes it from memory). */
export function providerPart(stored: BlueCodeStored): { provider: Record<string, unknown> } {
  return {
    provider: {
      bluecode: {
        npm: "@ai-sdk/openai-compatible",
        name: "BlueCode",
        options: { baseURL: stored.baseUrl, apiKey: stored.apiKey },
        models: stored.models,
      },
    },
  };
}

export const BLUECODE_PROBE_FILE = "bluecode-probe.json";

/**
 * Env for the `opencode models` probe so it lists `bluecode/*`: the 0600 provider-only
 * config the store wrote at save time (re-created here when missing; plus no project config). The caller adds
 * `--standalone` (without it opencode attaches to the background service and ignores
 * `OPENCODE_CONFIG`). `null` when BlueCode is not configured or the file can't be written — the
 * probe then stays exactly as before.
 */
export function bluecodeProbe(dir = aiProvidersDir()): { env: Record<string, string> } | null {
  const file = path.join(dir, BLUECODE_PROBE_FILE);
  const stored = readBlueCode(dir);
  if (!stored) return null;
  if (!existsSync(file)) {
    // Self-heal a missing probe file (0600); a failed write = not probed, never a throw.
    try {
      writeFileSync(file, JSON.stringify(providerPart(stored)), { mode: 0o600 });
    } catch {
      return null;
    }
  }
  return { env: { OPENCODE_CONFIG: file, OPENCODE_DISABLE_PROJECT_CONFIG: "1" } };
}

/** The variant ids (low / high / …) the gateway lists for a `bluecode/<model>` id; `[]` = none. */
export function bluecodeVariantIds(model: string, dir?: string): string[] {
  const entry = readBlueCode(dir)?.models[model.replace(/^bluecode\//, "")];
  const variants = entry?.variants;
  if (!variants || typeof variants !== "object") return [];
  return Object.entries(variants).flatMap(([id, v]) =>
    (v as { disabled?: unknown } | null)?.disabled === true ? [] : [id],
  );
}
