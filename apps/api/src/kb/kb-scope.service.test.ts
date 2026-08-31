import type { AgentRun, KnowledgeBaseSource, PipelineRun, Project, Team } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { KbScopeService } from "./kb-scope.service";

const source = (path: string): KnowledgeBaseSource => ({
  kind: "vault",
  path,
  readOnly: true,
});

const project = (over: Partial<Project> & Pick<Project, "id">): Project => ({
  name: over.id,
  path: `/work/${over.id}`,
  ...over,
});

const team = (over: Partial<Team> & Pick<Team, "id">): Team => ({
  name: over.id,
  ...over,
});

const agentRun = (over: Partial<AgentRun> & Pick<AgentRun, "runId" | "project">): AgentRun => ({
  agentId: "orchestrator",
  status: "done",
  pct: 100,
  title: "",
  prompt: "",
  files: [],
  cwd: "/work",
  startedAt: new Date().toISOString(),
  pid: 1,
  logFile: "/work/log",
  ...over,
});

const pipelineRun = (
  over: Partial<PipelineRun> & Pick<PipelineRun, "pipelineRunId">,
): PipelineRun => ({
  pipelineId: "release",
  status: "done",
  currentStage: null,
  stageRuns: [],
  startedAt: new Date().toISOString(),
  cwd: "/work",
  ...over,
});

interface Fixtures {
  teams?: Team[];
  projects?: Project[];
  agentRuns?: AgentRun[];
  pipelineRuns?: PipelineRun[];
  /**
   * Per-projectId override for the `resolvedProjects.knowledgeBaseFor` fake.
   * Deliberately NOT derived from `team.knowledgeBase` — a test that wants to
   * PIN the `ResolvedProjectService` seam sets a marker here that differs
   * from the team fixture's own `knowledgeBase`, so an implementation that
   * bypasses the resolver and reads `team.knowledgeBase` directly returns the
   * wrong (team-field) value instead of the marker and fails the assertion.
   */
  kbOverrides?: Record<string, KnowledgeBaseSource>;
}

/**
 * Builds a `KbScopeService` wired to plain-object fakes, mirroring the
 * `ResolvedProjectService` test convention (`resolved-project.service.test.ts`):
 * each fake mirrors only the shape of the real store `KbScopeService` calls,
 * cast `as never` past the real class's constructor param type.
 */
function build(fx: Fixtures = {}) {
  const teams = fx.teams ?? [];
  const projects = fx.projects ?? [];
  const agentRuns = fx.agentRuns ?? [];
  const pipelineRuns = fx.pipelineRuns ?? [];
  const kbOverrides = fx.kbOverrides ?? {};

  const teamsStore = {
    list: async () => teams,
    get: async (id: string) => {
      const found = teams.find((t) => t.id === id);
      if (!found) throw new Error(`team not found: ${id}`);
      return found;
    },
  };
  const projectsStore = {
    get: async (id: string) => {
      const found = projects.find((p) => p.id === id);
      if (!found) throw new Error(`project not found: ${id}`);
      return found;
    },
    list: async () => projects,
  };
  const resolvedProjects = {
    // Mirrors the real resolver's project -> team -> knowledgeBase chain, but
    // an override (when given) wins — see `Fixtures.kbOverrides` above.
    knowledgeBaseFor: async (projectId: string): Promise<KnowledgeBaseSource | null> => {
      if (projectId in kbOverrides) return kbOverrides[projectId] ?? null;
      const proj = projects.find((p) => p.id === projectId);
      if (!proj?.teamId) return null;
      const t = teams.find((candidate) => candidate.id === proj.teamId);
      return t?.knowledgeBase ?? null;
    },
  };
  const agentRunner = { listAll: async () => agentRuns };
  const pipelineRunner = { listAll: async () => pipelineRuns };

  return new KbScopeService(
    teamsStore as never,
    projectsStore as never,
    resolvedProjects as never,
    agentRunner as never,
    pipelineRunner as never,
  );
}

describe("KbScopeService", () => {
  describe("rootsForRun", () => {
    it("gives a project-scoped run only its own team's KB", async () => {
      const scope = build({
        // The team fixture's own `knowledgeBase` is deliberately a DIFFERENT
        // path than the resolver override below — an implementation that
        // bypasses `resolvedProjects.knowledgeBaseFor` and reads
        // `team.knowledgeBase` directly would return the wrong path here.
        teams: [
          {
            ...team({ id: "devrel", name: "DevRel" }),
            knowledgeBase: source("/kb/devrel-team-field-must-not-appear"),
          },
        ],
        projects: [project({ id: "proj-devrel", teamId: "devrel" })],
        agentRuns: [agentRun({ runId: "run-devrel", project: "proj-devrel" })],
        kbOverrides: { "proj-devrel": source("/kb/devrel-resolved-marker") },
      });
      const roots = await scope.rootsForRun("run-devrel");
      expect(roots.map((r) => r.teamId)).toEqual(["devrel"]);
      // Pins the resolver seam: the source must be exactly what
      // ResolvedProjectService.knowledgeBaseFor returned, not a value read off
      // `team.knowledgeBase` through some other path.
      expect(roots[0]?.source).toEqual(source("/kb/devrel-resolved-marker"));
      expect(roots[0]?.teamName).toBe("DevRel");
    });

    it("gives a run whose project has no team nothing", async () => {
      const scope = build({
        projects: [project({ id: "proj-teamless" })],
        agentRuns: [agentRun({ runId: "run-teamless", project: "proj-teamless" })],
      });
      expect(await scope.rootsForRun("run-teamless")).toEqual([]);
    });

    it("gives a run whose team has no KB nothing", async () => {
      const scope = build({
        teams: [team({ id: "kbless-team", name: "No KB Team" })],
        projects: [project({ id: "proj-kbless", teamId: "kbless-team" })],
        agentRuns: [agentRun({ runId: "run-kbless", project: "proj-kbless" })],
      });
      expect(await scope.rootsForRun("run-kbless")).toEqual([]);
    });

    it("gives an unknown run id nothing", async () => {
      const scope = build();
      expect(await scope.rootsForRun("run-does-not-exist")).toEqual([]);
    });

    it("gives an absent run id nothing (no runId at all — e.g. a chat turn misrouted here)", async () => {
      const scope = build({
        teams: [{ ...team({ id: "devrel", name: "DevRel" }), knowledgeBase: source("/kb/devrel") }],
        projects: [project({ id: "proj-devrel", teamId: "devrel" })],
        agentRuns: [agentRun({ runId: "run-devrel", project: "proj-devrel" })],
      });
      expect(await scope.rootsForRun(undefined)).toEqual([]);
    });

    it("ignores a team argument a run may not reach (narrows, never widens)", async () => {
      const scope = build({
        teams: [
          { ...team({ id: "devrel", name: "DevRel" }), knowledgeBase: source("/kb/devrel") },
          { ...team({ id: "platform", name: "Platform" }), knowledgeBase: source("/kb/platform") },
        ],
        projects: [project({ id: "proj-devrel", teamId: "devrel" })],
        agentRuns: [agentRun({ runId: "run-devrel", project: "proj-devrel" })],
      });
      expect((await scope.rootsForRun("run-devrel", "platform")).map((r) => r.teamId)).toEqual([]);
      // Sanity: the matching team argument still narrows-to-itself correctly.
      expect((await scope.rootsForRun("run-devrel", "devrel")).map((r) => r.teamId)).toEqual([
        "devrel",
      ]);
    });

    it("resolves an agent run by PREFIX match: the header is the pre-spawn `${agentId}_${startedMs}`, the persisted runId appends `_${pid}`", async () => {
      const scope = build({
        teams: [{ ...team({ id: "devrel", name: "DevRel" }), knowledgeBase: source("/kb/devrel") }],
        projects: [project({ id: "proj-devrel", teamId: "devrel" })],
        agentRuns: [
          agentRun({ runId: "codex_1000_4321", project: "proj-devrel" }),
          // A boundary-collision decoy: a DIFFERENT agent/start-time run whose id
          // shares the header as a raw string prefix but not up to an underscore
          // boundary. A naive `startsWith(header)` (no trailing "_") would match
          // this too; the correct implementation must not.
          agentRun({ runId: "codex_10000_9", project: "proj-teamless" }),
        ],
      });
      const roots = await scope.rootsForRun("codex_1000");
      expect(roots.map((r) => r.teamId)).toEqual(["devrel"]);
    });

    it("resolves a pipeline run by EXACT match: the header IS the pipelineRunId", async () => {
      const scope = build({
        teams: [{ ...team({ id: "devrel", name: "DevRel" }), knowledgeBase: source("/kb/devrel") }],
        projects: [project({ id: "proj-devrel-path", teamId: "devrel", path: "/repos/devrel" })],
        pipelineRuns: [pipelineRun({ pipelineRunId: "release_1", projectPath: "/repos/devrel" })],
      });
      const roots = await scope.rootsForRun("release_1");
      expect(roots.map((r) => r.teamId)).toEqual(["devrel"]);
    });
  });

  describe("rootsForChat", () => {
    it("gives a chat caller every team KB when no team is named", async () => {
      const scope = build({
        teams: [
          { ...team({ id: "devrel", name: "DevRel" }), knowledgeBase: source("/kb/devrel") },
          { ...team({ id: "platform", name: "Platform" }), knowledgeBase: source("/kb/platform") },
          team({ id: "kbless-team", name: "No KB Team" }),
        ],
      });
      const roots = await scope.rootsForChat(undefined);
      expect(roots.map((r) => r.teamId).sort()).toEqual(["devrel", "platform"]);
    });

    it("narrows a chat caller to the named team", async () => {
      const scope = build({
        teams: [
          { ...team({ id: "devrel", name: "DevRel" }), knowledgeBase: source("/kb/devrel") },
          { ...team({ id: "platform", name: "Platform" }), knowledgeBase: source("/kb/platform") },
        ],
      });
      expect((await scope.rootsForChat("devrel")).map((r) => r.teamId)).toEqual(["devrel"]);
    });

    it("gives an unknown team name nothing, never falls back to 'all'", async () => {
      const scope = build({
        teams: [{ ...team({ id: "devrel", name: "DevRel" }), knowledgeBase: source("/kb/devrel") }],
      });
      expect(await scope.rootsForChat("no-such-team")).toEqual([]);
    });

    it("naming a team that has no KB yields nothing, not the team without a source", async () => {
      const scope = build({
        teams: [team({ id: "kbless-team", name: "No KB Team" })],
      });
      expect(await scope.rootsForChat("kbless-team")).toEqual([]);
    });
  });
});
