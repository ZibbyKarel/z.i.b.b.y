import { Inject, Injectable } from "@nestjs/common";
import { initClient } from "@ts-rest/core";
import { appContract } from "@zibby/contracts";
import { z } from "zod";
import { ActivityLogService } from "../../activity/activity-log.service";
import { type SelfApiOperation, buildSelfApiCatalog } from "./self-api.catalog";

export type SelfApiRouteCall = (args: {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
}) => Promise<{ status: number; body: unknown }>;

/** Resolve one `<router>.<route>` to a callable, or `undefined` when it doesn't exist. */
export type SelfApiClient = (router: string, route: string) => SelfApiRouteCall | undefined;

export const SELF_API_CLIENT = Symbol("SELF_API_CLIENT");

/** Cap on the text returned to the model — run logs/artifacts can be megabytes. */
export const MAX_RESULT_CHARS = 20_000;

export interface SelfApiCallArgs {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
}

/**
 * The api calling itself over loopback HTTP via the ts-rest client, so every self-API
 * call passes the exact controller validation the UI's calls do. Base URL mirrors
 * `ChatSessionService.mcpBaseUrl` (host only — the contract carries the `/api` prefix).
 */
export function createLoopbackSelfApiClient(
  baseUrl = process.env.ZIBBY_API_BASE ?? `http://localhost:${process.env.PORT ?? 3333}`,
): SelfApiClient {
  // The one typed→dynamic seam: the client is indexed by catalog strings, which
  // buildSelfApiCatalog has already resolved against this same contract.
  const client = initClient(appContract, { baseUrl, baseHeaders: {} }) as unknown as Record<
    string,
    Record<string, SelfApiRouteCall> | undefined
  >;
  return (router, route) => client[router]?.[route];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the dot path exists in the value; arrays on the way are searched element-wise. */
function hasPath(value: unknown, segments: readonly string[]): boolean {
  if (Array.isArray(value)) return value.some((item) => hasPath(item, segments));
  const [head, ...rest] = segments;
  if (!isPlainObject(value) || head === undefined || !(head in value)) return false;
  return rest.length === 0 || hasPath(value[head], rest);
}

function jsonSchemaOf(schema: unknown): unknown {
  if (!(schema instanceof z.ZodType)) return undefined;
  return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
}

function truncate(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_RESULT_CHARS)}\n… (zkráceno, celkem ${text.length} znaků)`;
}

/**
 * Executes allowlisted self-API operations for the chat MCP tools. Reads are Tier 1
 * (silent). A successful write is Tier 2: it runs, then is recorded as a
 * `self-api-write` activity so the briefing reports it — a failed write records
 * nothing, so the briefing never claims work that didn't happen.
 */
@Injectable()
export class SelfApiExecutor {
  private readonly catalog = buildSelfApiCatalog();

  constructor(
    @Inject(SELF_API_CLIENT) private readonly client: SelfApiClient,
    private readonly activity: ActivityLogService,
  ) {}

  list(): string {
    return [...this.catalog.values()]
      .map((op) => `${op.name} [${op.tier}] — ${op.summary}`)
      .join("\n");
  }

  describe(name: string): { ok: boolean; text: string } {
    const op = this.catalog.get(name);
    if (!op) return this.unknown(name);
    return {
      ok: true,
      text: JSON.stringify(
        {
          name: op.name,
          tier: op.tier,
          route: `${op.method} ${op.path}`,
          summary: op.summary,
          params: op.pathParams,
          query: jsonSchemaOf(op.schemas.query),
          body: jsonSchemaOf(op.schemas.body),
          allowKeys: op.allowKeys,
          denyPaths: op.denyPaths,
          forceBody: op.forceBody,
        },
        null,
        2,
      ),
    };
  }

  async call(name: string, args: SelfApiCallArgs): Promise<{ ok: boolean; text: string }> {
    const op = this.catalog.get(name);
    const route = op ? this.client(op.router, op.route) : undefined;
    if (!op || !route) return this.unknown(name);
    const forbidden = this.forbiddenFields(op, args.body);
    if (forbidden.length > 0) {
      return {
        ok: false,
        text: `Pole ${forbidden.join(", ")} nelze měnit přes chat — změň ho v UI.`,
      };
    }
    try {
      const body = await this.bodyFor(op, args.body);
      const res = await route({
        ...(args.params ? { params: args.params } : {}),
        ...(args.query ? { query: args.query } : {}),
        ...(body !== undefined ? { body } : {}),
      });
      const ok = res.status >= 200 && res.status < 300;
      if (ok && op.tier === "write") {
        await this.activity.record({
          kind: "self-api-write",
          summary: `Změna konfigurace: ${op.summary}`,
          refs: { action: op.name, ...this.refsFor(op, args.params) },
        });
      }
      return { ok, text: truncate(`HTTP ${res.status}\n${JSON.stringify(res.body, null, 2)}`) };
    } catch (error) {
      return { ok: false, text: `Volání ${name} selhalo: ${String(error)}` };
    }
  }

  /** The op's body policy applied to the chat's raw body: keys outside `allowKeys`, and any
   *  `denyPaths` present at all (whatever their value). Empty = the body is acceptable. */
  private forbiddenFields(op: SelfApiOperation, body: unknown): string[] {
    const bad: string[] = [];
    if (op.allowKeys && isPlainObject(body)) {
      bad.push(...Object.keys(body).filter((k) => !op.allowKeys?.includes(k)));
    }
    for (const path of op.denyPaths ?? []) {
      if (hasPath(body, path.split("."))) bad.push(path);
    }
    return bad;
  }

  /** GET carries no body; other methods default to `{}` (EmptyBodySchema routes) with
   *  `forceBody` keys overwritten. `system.putConfig` replaces the whole document, so a
   *  partial edit is merged onto the current config first — otherwise every unsent field
   *  would reset to default. */
  private async bodyFor(op: SelfApiOperation, body: unknown): Promise<unknown> {
    if (op.method === "GET") return undefined;
    if (op.name !== "system.putConfig") {
      if (!op.forceBody) return body ?? {};
      return { ...(isPlainObject(body) ? body : {}), ...op.forceBody };
    }
    const get = this.client("system", "getConfig");
    const current = get ? await get({}) : undefined;
    if (!current || current.status !== 200 || !isPlainObject(current.body)) {
      throw new Error("nepodařilo se načíst aktuální system config");
    }
    return { ...current.body, ...(isPlainObject(body) ? body : {}) };
  }

  private refsFor(
    op: SelfApiOperation,
    params: Record<string, string> | undefined,
  ): { projectId?: string; integrationId?: string } {
    const id = params?.id;
    if (!id) return {};
    if (op.router === "projects") return { projectId: id };
    if (op.router === "integrations") return { integrationId: id };
    return {};
  }

  private unknown(name: string): { ok: false; text: string } {
    return {
      ok: false,
      text: `Operace „${name}" není dostupná. Seznam povolených operací vrátí api_list_operations.`,
    };
  }
}
