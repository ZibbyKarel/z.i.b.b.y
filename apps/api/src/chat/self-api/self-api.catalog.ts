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
  /** The route's raw zod schemas (or ts-rest plain types) for `api_describe_operation`. */
  schemas: { query?: unknown; body?: unknown };
}

export type SelfApiAllowlist = Readonly<Record<string, Readonly<Record<string, SelfApiTier>>>>;

/**
 * Everything the chat may do to ZIBBY's own API. Explicit on purpose: a new endpoint
 * is NOT reachable until it is listed here with a tier. Only non-destructive routes —
 * no DELETE, nothing that starts/stops execution (dispatch stays `create_task`, which
 * carries the mention/attachment routing), nothing that touches secrets.
 */
export const SELF_API_ALLOWLIST: SelfApiAllowlist = {
  tasks: {
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
    createWorkflow: "write",
    updateWorkflow: "write",
  },
  workflowRuns: { listWorkflowRuns: "read" },
  companies: {
    listCompanies: "read",
    searchCompanies: "read",
    getCompany: "read",
    createCompany: "write",
    updateCompany: "write",
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
    createProject: "write",
    updateProject: "write",
    cloneProject: "write",
  },
  automations: {
    listAutomations: "read",
    searchAutomations: "read",
    getAutomation: "read",
    createAutomation: "write",
    updateAutomation: "write",
  },
  integrations: {
    listIntegrations: "read",
    getIntegration: "read",
    createIntegration: "write",
    updateIntegration: "write",
    testIntegration: "write",
  },
  system: { getConfig: "read", putConfig: "write" },
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

/** Resolve the allowlist against the contract; throws on any denied/unknown/DELETE entry. */
export function buildSelfApiCatalog(
  contract: Record<string, unknown> = appContract,
  allow: SelfApiAllowlist = SELF_API_ALLOWLIST,
): ReadonlyMap<string, SelfApiOperation> {
  const out = new Map<string, SelfApiOperation>();
  for (const [router, routes] of Object.entries(allow)) {
    for (const [route, tier] of Object.entries(routes)) {
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
      out.set(name, {
        name,
        router,
        route,
        tier,
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
