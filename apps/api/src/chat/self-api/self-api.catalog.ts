import { appContract } from "@zibby/contracts";

/** Tier 1 (`read`, silent) or Tier 2 (`write`, act-then-report via activity). */
export type SelfApiTier = "read" | "write";

/** One allowlisted ts-rest route, resolved against the contract. */
export interface SelfApiOperation {
  /** `<router>.<route>`, the id the model passes to `api_call`. */
  name: string;
  router: string;
  route: string;
  tier: SelfApiTier;
  method: string;
  /** Full path including the contract's `/api` prefix. */
  path: string;
  summary: string;
  /** `:param` names parsed from {@link path}, in order. */
  pathParams: readonly string[];
  /** Body keys the call may set (top level). Unset = unrestricted. Enforced by the executor. */
  allowKeys?: readonly string[];
  /** Dot paths (e.g. `config.baseUrl`) the body must not contain. Enforced by the executor. */
  denyPaths?: readonly string[];
  /** Top-level body keys the executor sets/overwrites before the call. Validated against the body schema at build time. */
  forceBody?: Readonly<Record<string, unknown>>;
  /** The route's raw zod schemas (or ts-rest plain types) for `api_describe_operation`. */
  schemas: { query?: unknown; body?: unknown };
}

/** A bare tier, or a tier plus a body policy (Law 1: route names alone can be bypassed via body fields). */
export type SelfApiEntry =
  | SelfApiTier
  | {
      tier: SelfApiTier;
      allowKeys?: readonly string[];
      denyPaths?: readonly string[];
      forceBody?: Readonly<Record<string, unknown>>;
    };

export type SelfApiAllowlist = Readonly<Record<string, Readonly<Record<string, SelfApiEntry>>>>;

/** Presentation keys of a project the chat may edit (companyId is create-only: unlinking drops the company budget) — never policy, budget, commands, env, plugins. */
const PROJECT_SAFE_KEYS = [
  "name",
  "desc",
  "category",
  "web",
  "logo",
  "identity",
  "daily_rhythm",
  "teamId",
] as const;

/**
 * Everything the chat may do to ZIBBY's own API. Explicit on purpose: a new endpoint
 * is NOT reachable until it is listed here with a tier. Only non-destructive routes —
 * no DELETE, nothing that starts/stops execution (dispatch stays `create_task`, which
 * carries the mention/attachment routing), nothing that touches secrets.
 */
export const SELF_API_ALLOWLIST: SelfApiAllowlist = {
  tasks: {
    // POST but read tier: side-effect free, only costs model tokens.
    classifyTask: "read",
    listScheduledTasks: "read",
    getTaskParents: "read",
    getTask: "read",
  },
  taskRuns: {
    listTaskRuns: "read",
    listArchivedTaskRuns: "read",
    getArchivedTaskRunCounts: "read",
    getTaskRun: "read",
    getTaskRunLogs: "read",
    getTaskRunStageLogs: "read",
    getTaskRunArtifact: "read",
    assignTaskRunProject: "write",
  },
  workflows: {
    listWorkflows: "read",
    getWorkflow: "read",
    // No createWorkflow: a new workflow's phases carry approval gates and shell commands.
    // Metadata only; phases/outputs/instructions/budget stay out of the chat's reach.
    updateWorkflow: { tier: "write", allowKeys: ["name", "avatar", "desc", "department"] },
  },
  workflowRuns: { listWorkflowRuns: "read" },
  companies: {
    listCompanies: "read",
    searchCompanies: "read",
    getCompany: "read",
    // `budget` (spend caps) is operator-only.
    createCompany: {
      tier: "write",
      allowKeys: ["id", "name", "desc", "people"],
      denyPaths: ["people.vip"],
    },
    updateCompany: {
      tier: "write",
      allowKeys: ["name", "desc", "people"],
      denyPaths: ["people.vip"],
    },
  },
  teams: {
    listTeams: "read",
    searchTeams: "read",
    getTeam: "read",
    createTeam: "write",
    updateTeam: "write",
  },
  projects: {
    listProjects: "read",
    searchProjects: "read",
    getProject: "read",
    getProjectProfile: "read",
    getStandup: "read",
    getResolvedProject: "read",
    getProjectLocalState: "read",
    getProjectPrs: "read",
    // Not allowed: autonomy_policy, budget, checks (shell), env, plugins, prOpenMode.
    createProject: {
      tier: "write",
      allowKeys: ["id", "path", "gitRemote", "companyId", ...PROJECT_SAFE_KEYS],
      denyPaths: ["identity.people.vip"],
    },
    updateProject: {
      tier: "write",
      allowKeys: PROJECT_SAFE_KEYS,
      // `vip` forces Tier-3 escalation, so it is the operator's to set.
      denyPaths: ["identity.people.vip"],
    },
    cloneProject: "write",
  },
  automations: {
    listAutomations: "read",
    searchAutomations: "read",
    getAutomation: "read",
    // Trigger/target stay editable. Signal triggers dispatch at once unless approval is "ask",
    // so the executor forces it; tool grants are the gate's.
    createAutomation: {
      tier: "write",
      forceBody: { approval: "ask" },
      denyPaths: ["target.toolGrants"],
    },
    updateAutomation: {
      tier: "write",
      forceBody: { approval: "ask" },
      denyPaths: ["target.toolGrants"],
    },
  },
  integrations: {
    listIntegrations: "read",
    getIntegration: "read",
    createIntegration: "write",
    // Hosts/ports: repointing them would send the stored credential to another endpoint.
    updateIntegration: {
      tier: "write",
      denyPaths: [
        "config.baseUrl",
        "config.imapHost",
        "config.imapPort",
        "config.smtpHost",
        "config.smtpPort",
      ],
    },
    testIntegration: "write",
  },
  system: {
    getConfig: "read",
    // Whole-document PUT: the executor merges the chat's partial body onto the current config
    // (omitted keys keep their value) and checks denyPaths on the partial body, so these stay
    // untouched. The scheduler, auto-resume and tick switches are operator-only.
    putConfig: {
      tier: "write",
      denyPaths: ["goalAutoResume", "limitResumeMax", "automationTickMs", "roadmapTickMs"],
    },
  },
  machine: { getMachineConfig: "read", updateMachineConfig: "write" },
};

/**
 * Law 1 floor: routers/routes the self-API can never reach, whatever the allowlist
 * says. These are the gate itself (rules, mandate, budget, approvals), secrets, the
 * autonomy profile, irreversible/outward actions and execution triggers. Checked at
 * build (= boot) time so a bad allowlist edit fails loudly instead of shipping.
 */
const DENIED_ROUTERS = new Set([
  "gates",
  "gateRules",
  "mandate",
  "budget",
  "approvals",
  "self",
  "selfKnowledge",
  "mcpServers",
  "chat",
  "security",
]);
const DENIED_ROUTES = new Set([
  "integrations.setCredentials",
  "integrations.deleteCredentials",
  "projects.setProjectSecrets",
  "projects.deleteProjectSecrets",
  "projects.updateProjectProfile",
  "projects.mergeProjectPr",
  "tasks.createTask",
  "automations.triggerAutomation",
  "taskRuns.stopTaskRun",
  "taskRuns.resumeTaskRun",
]);

interface RouteShape {
  method: string;
  path: string;
  summary?: string;
  query?: unknown;
  body?: unknown;
}

function isRouteShape(value: unknown): value is RouteShape {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.method === "string" && typeof v.path === "string";
}

/** Collect every object shape reachable by unwrapping optional/pipe/union wrappers. */
function objectShapes(schema: unknown, depth = 0): Record<string, unknown>[] {
  if (typeof schema !== "object" || schema === null || depth > 8) return [];
  const s = schema as { shape?: unknown; _def?: Record<string, unknown> };
  if (typeof s.shape === "object" && s.shape !== null) return [s.shape as Record<string, unknown>];
  const def = s._def ?? {};
  const next: unknown[] = [def.innerType, def.in, def.schema, def.element];
  if (Array.isArray(def.options)) next.push(...def.options);
  return next.flatMap((n) => objectShapes(n, depth + 1));
}

/** Throw unless every dot path exists in at least one variant of the body schema. */
function assertPathsExist(name: string, body: unknown, paths: readonly string[], what: string) {
  for (const path of paths) {
    let level: unknown[] = [body];
    for (const seg of path.split(".")) {
      level = level.flatMap((l) => objectShapes(l).flatMap((sh) => (seg in sh ? [sh[seg]] : [])));
      if (level.length === 0)
        throw new Error(`self-api: ${name} ${what} "${path}" is not in its body`);
    }
  }
}

/** Throw unless every forceBody key exists in the body and its value parses against that field. */
function assertForceBody(name: string, body: unknown, force: Readonly<Record<string, unknown>>) {
  const shapes = objectShapes(body);
  for (const [key, value] of Object.entries(force)) {
    const fields = shapes.flatMap((sh) => (key in sh ? [sh[key]] : []));
    const ok = fields.some((f) => {
      const parse = (f as { safeParse?: (v: unknown) => { success: boolean } }).safeParse;
      return typeof parse === "function" && parse.call(f, value).success;
    });
    if (!ok)
      throw new Error(`self-api: ${name} forceBody "${key}" is not a valid body field value`);
  }
}

/** Resolve the allowlist against the contract; throws on any denied/unknown/DELETE entry. */
export function buildSelfApiCatalog(
  contract: Record<string, unknown> = appContract,
  allow: SelfApiAllowlist = SELF_API_ALLOWLIST,
): ReadonlyMap<string, SelfApiOperation> {
  const out = new Map<string, SelfApiOperation>();
  for (const [router, routes] of Object.entries(allow)) {
    for (const [route, entry] of Object.entries(routes)) {
      const {
        tier,
        allowKeys,
        denyPaths,
        forceBody,
      }: Exclude<SelfApiEntry, SelfApiTier> & {
        tier: SelfApiTier;
      } = typeof entry === "string" ? { tier: entry } : entry;
      const name = `${router}.${route}`;
      if (DENIED_ROUTERS.has(router) || DENIED_ROUTES.has(name)) {
        throw new Error(`self-api: ${name} is denied (Law 1 floor) and cannot be allowlisted`);
      }
      const routerDef = contract[router];
      const def =
        typeof routerDef === "object" && routerDef !== null
          ? (routerDef as Record<string, unknown>)[route]
          : undefined;
      if (!isRouteShape(def)) throw new Error(`self-api: unknown route ${name}`);
      if (def.method === "DELETE") throw new Error(`self-api: ${name} is a DELETE route`);
      if (allowKeys) assertPathsExist(name, def.body, allowKeys, "allowKeys entry");
      if (forceBody) assertForceBody(name, def.body, forceBody);
      if (denyPaths) assertPathsExist(name, def.body, denyPaths, "denyPaths entry");
      out.set(name, {
        name,
        router,
        route,
        tier,
        ...(allowKeys && { allowKeys }),
        ...(denyPaths && { denyPaths }),
        ...(forceBody && { forceBody }),
        method: def.method,
        path: def.path,
        summary: def.summary ?? name,
        pathParams: [...def.path.matchAll(/:(\w+)/g)].flatMap((m) => (m[1] ? [m[1]] : [])),
        schemas: { query: def.query, body: def.body },
      });
    }
  }
  return out;
}
