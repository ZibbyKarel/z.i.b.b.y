import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { teamsContract } from "@zibby/contracts";
import { ModuleRef } from "@nestjs/core";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { KbReaderService } from "../kb/kb-reader.service";
import { TeamKbSyncError, TeamKbSyncService } from "./team-kb-sync.service";
import { TeamConflictError, TeamNotFoundError } from "./teams.errors";
import { TeamsStorageService } from "./teams.storage.service";

/** The KB's own append-only ingest log (repo-relative). */
const INGEST_LOG_REL = "_meta/log.md";
const INGEST_LOG_LINES = 20;

/** Canonical absolute path (`~` expanded, symlinks resolved), or null when it doesn't exist. */
async function canonicalPath(p: string): Promise<string | null> {
  const expanded = p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p;
  return fs.realpath(path.resolve(expanded)).catch(() => null);
}

const errors = makeErrorMapper("Team", {
  missing: [TeamNotFoundError],
  conflict: [TeamConflictError],
});

/**
 * Implements `teamsContract` against the JSON-manifest-backed storage
 * service. Mirrors `CompaniesController` in shape; `searchTeams`
 * (`GET /teams/search`) is declared before `getTeam` in the contract so it is
 * matched as its own route rather than captured by `GET /teams/:id`.
 */
@Controller()
export class TeamsController {
  constructor(
    private readonly storage: TeamsStorageService,
    private readonly kbReader: KbReaderService,
    private readonly kbSync: TeamKbSyncService,
    // Lazy, global lookup (not an injection): importing ProjectsModule would close the
    // teams <-> resolved-project module cycle, and a second ProjectsStorageService
    // instance would re-run its startup manifest cleanup against the same dir.
    private readonly moduleRef: ModuleRef,
  ) {}

  /** The team's KB source, or null when the team is missing or has no KB (→ 404). */
  private async kbOf(id: string) {
    const team = await this.storage.get(id).catch((e: unknown) => {
      if (errors.isMissing(e)) return null;
      throw e;
    });
    return team?.knowledgeBase ?? null;
  }

  @TsRestHandler(teamsContract)
  handler() {
    return tsRestHandler(teamsContract, {
      createTeam: ({ body }) => errors.created(() => this.storage.create(body)),

      listTeams: async () => ({ status: 200, body: await this.storage.list() }),

      searchTeams: async ({ query: { q } }) => ({
        status: 200,
        body: await this.storage.search(q),
      }),

      getTeam: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      getTeamKbGraph: async ({ params: { id } }) => {
        const team = await this.storage.get(id).catch((e: unknown) => {
          if (errors.isMissing(e)) return null;
          throw e;
        });
        if (!team?.knowledgeBase) {
          return { status: 404 as const, body: { message: `Team "${id}" has no knowledge base` } };
        }
        return { status: 200 as const, body: await this.kbReader.graph(team.knowledgeBase) };
      },

      listTeamKbNotes: async ({ params: { id } }) => {
        const kb = await this.kbOf(id);
        if (!kb)
          return { status: 404 as const, body: { message: `Team "${id}" has no knowledge base` } };
        return { status: 200 as const, body: await this.kbReader.notes(kb) };
      },

      getTeamKbNote: async ({ params: { id }, query: { path: notePath } }) => {
        const kb = await this.kbOf(id);
        if (!kb)
          return { status: 404 as const, body: { message: `Team "${id}" has no knowledge base` } };
        const note = await this.kbReader.readPath(kb, notePath);
        if (!note)
          return { status: 404 as const, body: { message: `Note "${notePath}" not found` } };
        return { status: 200 as const, body: note };
      },

      getTeamKbIngest: async ({ params: { id } }) => {
        const kb = await this.kbOf(id);
        if (!kb)
          return { status: 404 as const, body: { message: `Team "${id}" has no knowledge base` } };
        const kbPath = await canonicalPath(kb.path);
        let projectId: string | null = null;
        if (kbPath) {
          for (const project of await this.moduleRef
            .get(ProjectsStorageService, { strict: false })
            .list()) {
            if (project.path && (await canonicalPath(project.path)) === kbPath) {
              projectId = project.id;
              break;
            }
          }
        }
        const lines = await this.kbReader.tailLines(kb, INGEST_LOG_REL, INGEST_LOG_LINES);
        return { status: 200 as const, body: { projectId, log: lines.map((line) => ({ line })) } };
      },

      syncTeamKb: async ({ params: { id } }) => {
        const team = await this.storage.get(id).catch((e: unknown) => {
          if (errors.isMissing(e)) return null;
          throw e;
        });
        if (!team?.knowledgeBase) {
          return { status: 404 as const, body: { message: `Team "${id}" has no knowledge base` } };
        }
        try {
          return { status: 200 as const, body: await this.kbSync.sync(team.knowledgeBase.path) };
        } catch (e) {
          if (e instanceof TeamKbSyncError) {
            return { status: 409 as const, body: { message: e.message } };
          }
          throw e;
        }
      },

      updateTeam: ({ params: { id }, body }) =>
        errors.or404(id, () => this.storage.update(id, body)),

      deleteTeam: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.get(id); // 404 before any side effect
          await this.storage.delete(id);
          return { id };
        }),
    });
  }
}
