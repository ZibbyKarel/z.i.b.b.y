import { Injectable } from "@nestjs/common";
import type { AgentRun, KnowledgeBaseSource, PipelineRun, Project } from "@zibby/contracts";
import { AgentRunnerService } from "../agents/agent-runner.service";
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { TeamsStorageService } from "../teams/teams.storage.service";

/** One knowledge base a caller is allowed to read, with the team it belongs to. */
export interface KbRoot {
  readonly teamId: string;
  readonly teamName: string;
  readonly source: KnowledgeBaseSource;
}

/**
 * The entire security story of the `zibby-kb` MCP server: which knowledge-base
 * roots a given caller may read at all. `KbReaderService` reads ONE root once
 * it is handed one; this service decides which roots ever reach that call.
 *
 * ## The asymmetry (deliberate — read before touching either method)
 *
 * A **project-scoped run** (agent or pipeline) reaches ONLY its own team's KB:
 * `runId → run record → projectId → knowledgeBaseFor → [root]`. No team, a
 * team with no KB, an unknown run id, or an absent runId all fail closed to
 * `[]`. The constraint here exists to bound what an AUTONOMOUS run can reach —
 * it is a leash on the run, not a secrecy wall around the team's notes.
 *
 * A **chat turn** has the OPERATOR as its principal, and carries no project at
 * all (`ChatSessionService` never resolves one). So `rootsForChat(undefined)`
 * deliberately returns EVERY team that has a knowledge base, not `[]`.
 * Without this split, an untagged chat turn would resolve to no project → no
 * team → empty — silently killing the primary use case ("let it follow from
 * the conversation") the whole feature exists for. `rootsForChat("devrel")`
 * narrows to that one team; it is the same "explicit team narrows" rule the
 * run path also obeys, just starting from "everything" instead of "one".
 *
 * ## `team` narrows, never widens
 *
 * On BOTH methods, an explicit `team` argument can only shrink the caller's
 * reach to a team it could already see unscoped — never grant access to a
 * team the caller could not otherwise reach. `rootsForRun(runId, "platform")`
 * on a run scoped to `"devrel"` returns `[]`, not the platform root.
 *
 * ## Resolving a run id to a project
 *
 * The `X-Zibby-Run-Id` header is NOT authentication — it is low-entropy,
 * guessable, and forgeable by any local process, including the run itself.
 * It is scoping input only; the auth boundary for the whole `zibby-kb`
 * endpoint is the guard (bearer token + loopback check), never this value.
 *
 * For an AGENT run the header carries the *pre-spawn* id
 * `${agentId}_${startedMs}`, while `RunnerCore` persists
 * `${ownerId}_${startedMs}_${pid}` (the pid is unknowable before the command
 * is built) — built from the SAME `startedMs`, so the persisted id is
 * deterministically `<header>_<pid>`. Resolved by {@link matchesAgentRunId}:
 * the boundary underscore alone does NOT rule out a false match — a BARE
 * `agentId` (a public constant, not a secret) is itself a shorter,
 * boundary-aligned prefix of `${agentId}_${startedMs}_${pid}`, so a naive
 * `startsWith(header + "_")` would let a truncated header resolve to
 * whatever project that agent last ran under. The remainder after the
 * boundary must additionally be a SINGLE numeric segment (`_${pid}`, never
 * `_${startedMs}_${pid}`) for the match to count. Exact equality is also
 * supported: for a PIPELINE run the header IS `pipelineRunId` outright, and
 * a completed agent run may in principle match exactly too.
 *
 * ## Record → project is a by-reference lookup, not a stored id
 *
 * Neither run record stores a canonical `projectId`. An `AgentRun` carries
 * only `project` — the free-form label the caller passed to `startRun`
 * (an id or a display name) — so it is resolved the same by-id-then-by-name
 * way `AgentRunnerService`'s own (private) `resolveProject` does. A
 * `PipelineRun` carries only `projectPath` (absolute path), resolved the same
 * by-path way `PipelineRunnerService`'s own (private) `projectForRun` does.
 * This is fidelity to what the records actually hold, not an invented
 * fallback — this service does not have access to those private methods, and
 * would need the identical lookup even if it did.
 *
 * Caveat this implies, stated plainly: this is NOT a "fails closed at worst"
 * lookup. Neither `AgentRun` nor `PipelineRun` persists a canonical
 * `projectId` — resolution is a query-time lookup by free-form label/path,
 * redone on every call. If the referenced project is deleted and a new one is
 * registered reusing the same id or name (or the same `projectPath`), the
 * SAME run id resolves to a DIFFERENT team's knowledge base entirely — a team
 * the run never started under. This is a silent cross-team leak, not a
 * fail-closed degradation.
 *
 * FOLLOW-UP (named, before this drift can matter in practice): persist a resolved
 * `projectId` on the run record at run start and resolve from that, instead of
 * re-resolving a free-form label at query time.
 */
@Injectable()
export class KbScopeService {
  constructor(
    private readonly teams: TeamsStorageService,
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
  ) {}

  /**
   * The KB roots a project-scoped run may read — at most one, since a run has
   * at most one project. Fails closed to `[]` on every "no" (see class doc).
   */
  async rootsForRun(runId: string | undefined, team?: string): Promise<KbRoot[]> {
    if (!runId) return [];
    const project = await this.projectForRun(runId);
    if (!project) return [];
    const source = await this.resolvedProjects.knowledgeBaseFor(project.id).catch(() => null);
    if (!source) return [];
    if (!project.teamId) return [];
    const teamRecord = await this.teams.get(project.teamId).catch(() => null);
    if (!teamRecord) return [];
    if (team && team !== teamRecord.id) return [];
    return [{ teamId: teamRecord.id, teamName: teamRecord.name, source }];
  }

  /**
   * The KB roots a chat turn may read. With no `team`, every team that has a
   * knowledge base — the operator is the principal and carries no project
   * (see class doc for why this is NOT the same "no project → empty" rule
   * `rootsForRun` applies). With a `team`, narrowed to that one team only —
   * naming a team with no KB, or a team that doesn't exist, yields `[]`.
   */
  async rootsForChat(team?: string): Promise<KbRoot[]> {
    const teams = await this.teams.list();
    return teams.flatMap((t) => {
      if (!t.knowledgeBase) return [];
      if (team && t.id !== team) return [];
      return [{ teamId: t.id, teamName: t.name, source: t.knowledgeBase }];
    });
  }

  /** Resolve a run id (agent prefix-match, or pipeline/agent exact-match) to its project. */
  private async projectForRun(runId: string): Promise<Project | null> {
    const agentRuns = await this.agentRunner.listAll().catch((): AgentRun[] => []);
    const agentMatch = agentRuns.find((r) => matchesAgentRunId(r.runId, runId));
    if (agentMatch) return this.resolveByRef(agentMatch.project);

    const pipelineRuns = await this.pipelineRunner.listAll().catch((): PipelineRun[] => []);
    const pipelineMatch = pipelineRuns.find((r) => r.pipelineRunId === runId);
    if (pipelineMatch) return this.resolveByPath(pipelineMatch.projectPath);

    return null;
  }

  /** By id first, then by exact name — mirrors `AgentRunnerService`'s private `resolveProject`. */
  private async resolveByRef(ref: string): Promise<Project | null> {
    if (!ref) return null;
    const direct = await this.projects.get(ref).catch((): Project | null => null);
    if (direct) return direct;
    const all = await this.projects.list().catch((): Project[] => []);
    return all.find((p) => p.name === ref) ?? null;
  }

  /** By absolute path — mirrors `PipelineRunnerService`'s private `projectForRun`. */
  private async resolveByPath(projectPath: string | undefined): Promise<Project | null> {
    if (!projectPath) return null;
    const all = await this.projects.list().catch((): Project[] => []);
    return all.find((p) => p.path === projectPath) ?? null;
  }
}

/**
 * True when a persisted agent run id matches the `X-Zibby-Run-Id` header — exact
 * equality, or the header plus exactly one MORE numeric segment (the pid
 * `RunnerCore` cannot know before spawn: `${header}_${pid}`).
 *
 * A plain `record.startsWith(header + "_")` is NOT enough: a bare `agentId`
 * header (`architekt`, `koder`, … — public constants in the runner, never
 * secret) is itself a shorter, boundary-aligned prefix of
 * `${agentId}_${startedMs}_${pid}`, so it would satisfy that check too and
 * resolve to whatever project that agent last ran under — any run reaching
 * any other team's knowledge base just by truncating its own run id down to
 * the bare agent id. Requiring the remainder to be a SINGLE all-digit segment
 * accepts `<agentId>_<startedMs>` → `_<pid>` (the intended case) while
 * rejecting `<agentId>` → `_<startedMs>_<pid>` (two segments, and the second
 * one isn't the pid).
 */
function matchesAgentRunId(record: string, header: string): boolean {
  if (record === header) return true;
  if (!record.startsWith(`${header}_`)) return false;
  const rest = record.slice(header.length + 1);
  return /^\d+$/.test(rest);
}
