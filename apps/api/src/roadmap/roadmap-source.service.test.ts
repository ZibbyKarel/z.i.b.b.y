import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Attachment, CredentialsInput, Integration, Project } from "@zibby/contracts";
import { roadmapItemIdForSource } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectNotFoundError } from "../projects/projects.errors";
import { LevelMappingStore } from "./level-mapping.store";
import { RoadmapSourceService } from "./roadmap-source.service";
import { RoadmapStore } from "./roadmap.store";

const PROJECT: Project = { id: "acme", name: "Acme", path: "~/Projects/acme" };

interface UploadedFileLike {
  originalname: string;
  size: number;
  mimetype?: string;
  buffer: Buffer;
}

function fakeAttachmentStorage() {
  let counter = 0;
  const save = vi.fn(async (files: UploadedFileLike[]) => {
    counter += 1;
    const attachmentSetId = `set_${counter}`;
    const metas: Attachment[] = files.map((file) => ({
      name: file.originalname,
      size: file.size,
      ...(file.mimetype ? { mediaType: file.mimetype } : {}),
    }));
    return { attachmentSetId, files: metas };
  });
  return { save };
}

async function buildService(opts: {
  dir: string;
  levelMappingFile: string;
  integrations: Integration[];
  creds?: Record<string, CredentialsInput | null>;
  fetchImpl: typeof fetch;
  attachmentStore?: { save: ReturnType<typeof fakeAttachmentStorage>["save"] };
}): Promise<{
  service: RoadmapSourceService;
  roadmap: RoadmapStore;
  attachmentSave: ReturnType<typeof fakeAttachmentStorage>["save"];
}> {
  const roadmap = new RoadmapStore(opts.dir);
  await roadmap.onModuleInit();
  const levelMapping = new LevelMappingStore(opts.levelMappingFile);
  const projects = {
    get: async (id: string) => {
      if (id !== PROJECT.id) throw new ProjectNotFoundError(id);
      return PROJECT;
    },
  };
  const resolvedProjects = { resolveIntegrations: async () => opts.integrations };
  const creds = opts.creds ?? {};
  const credentials = {
    read: async (integrationId: string) => creds[integrationId] ?? { token: "tok" },
  };
  const attachmentStore = opts.attachmentStore ?? fakeAttachmentStorage();
  const service = new RoadmapSourceService(
    roadmap as never,
    levelMapping as never,
    projects as never,
    resolvedProjects as never,
    credentials as never,
    attachmentStore as never,
    opts.fetchImpl,
  );
  return { service, roadmap, attachmentSave: attachmentStore.save };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// --- Jira fixtures -----------------------------------------------------------

const JIRA_BASE_URL = "https://acme.atlassian.net";

const JIRA_INTEGRATION: Integration = {
  id: "proj-jira",
  kind: "jira",
  projectId: "acme",
  enabled: true,
  status: "connected",
  hasCredentials: true,
  config: { kind: "jira", baseUrl: JIRA_BASE_URL, email: "me@acme.com", projectKey: "PROJ" },
};

const adfParagraph = (text: string) => ({
  type: "doc",
  version: 1,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const jiraIssuesFull = [
  {
    key: "PROJ-1",
    fields: {
      summary: "Rollout epic",
      description: adfParagraph("Epic body"),
      issuetype: { name: "Epic" },
      status: { name: "To Do", statusCategory: { key: "new" } },
      attachment: [
        {
          filename: "spec.pdf",
          size: 1234,
          mimeType: "application/pdf",
          content: `${JIRA_BASE_URL}/secure/attachment/10001/spec.pdf`,
        },
        {
          filename: "huge.zip",
          size: 30 * 1024 * 1024,
          mimeType: "application/zip",
          content: `${JIRA_BASE_URL}/secure/attachment/10002/huge.zip`,
        },
      ],
    },
  },
  {
    key: "PROJ-2",
    fields: {
      summary: "Story A",
      description: adfParagraph("Story A body"),
      issuetype: { name: "Story" },
      parent: { key: "PROJ-1" },
      status: { name: "Done", statusCategory: { key: "done" } },
      // PROJ-2 is BLOCKED BY PROJ-3 — the `inwardIssue` direction.
      issuelinks: [
        {
          type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
          inwardIssue: { key: "PROJ-3" },
        },
      ],
    },
  },
  {
    key: "PROJ-3",
    fields: {
      summary: "Story B",
      description: adfParagraph("Story B body"),
      issuetype: { name: "Story" },
      parent: { key: "PROJ-1" },
      status: { name: "To Do", statusCategory: { key: "new" } },
      // PROJ-3 BLOCKS PROJ-2 — the `outwardIssue` direction. PROJ-3 itself
      // must NOT come out depending on PROJ-2 (that would be the exact
      // inverted-edge bug this phase exists to prevent).
      issuelinks: [
        {
          type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
          outwardIssue: { key: "PROJ-2" },
        },
      ],
    },
  },
  {
    key: "PROJ-4",
    fields: {
      summary: "Subtask of Story A",
      description: adfParagraph("Subtask body"),
      issuetype: { name: "Sub-task" },
      parent: { key: "PROJ-2" },
      status: { name: "To Do", statusCategory: { key: "new" } },
    },
  },
];

function jiraFetch(state: { issues: unknown[] }): typeof fetch {
  return (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/rest/api/3/search")) {
      return jsonResponse({ issues: state.issues, total: state.issues.length });
    }
    if (u.endsWith("/secure/attachment/10001/spec.pdf")) {
      return new Response(Buffer.from("pdf-bytes"), { status: 200 });
    }
    if (u.endsWith("/secure/attachment/10002/huge.zip")) {
      throw new Error("huge.zip should never be downloaded — it's over the 25 MB cap");
    }
    throw new Error(`unhandled jira fetch: ${u}`);
  }) as unknown as typeof fetch;
}

// --- GitHub fixtures ----------------------------------------------------------

const GITHUB_INTEGRATION: Integration = {
  id: "proj-github",
  kind: "github",
  projectId: "acme",
  enabled: true,
  status: "connected",
  hasCredentials: true,
  config: { kind: "github", repo: "acme/app", streams: ["issues", "pulls"] },
};

const githubMilestonesFull = [
  {
    number: 1,
    title: "Launch",
    description: "Launch milestone",
    state: "open",
    html_url: "https://github.com/acme/app/milestone/1",
  },
];

const githubIssuesFull = [
  {
    number: 10,
    title: "Do the launch work",
    body: "Some work.\n\nDepends on #11 and blocked by #12",
    state: "open",
    html_url: "https://github.com/acme/app/issues/10",
    milestone: { number: 1 },
  },
  {
    number: 11,
    title: "Prereq A",
    body: "",
    state: "closed",
    html_url: "https://github.com/acme/app/issues/11",
    milestone: { number: 1 },
  },
  {
    number: 12,
    title: "Prereq B",
    body: "",
    state: "open",
    html_url: "https://github.com/acme/app/issues/12",
    milestone: { number: 1 },
  },
  {
    number: 99,
    title: "A pull request, not an issue",
    body: "",
    state: "open",
    html_url: "https://github.com/acme/app/pull/99",
    pull_request: { url: "https://api.github.com/repos/acme/app/pulls/99" },
  },
];

function githubFetch(state: { issues: unknown[]; milestones: unknown[] }): typeof fetch {
  return (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/sub_issues")) {
      // Older-API tolerance: a 404 here is NOT an error.
      return jsonResponse({ message: "Not Found" }, 404);
    }
    if (u.includes("/milestones")) {
      return jsonResponse(state.milestones);
    }
    if (u.includes("/issues")) {
      return jsonResponse(state.issues);
    }
    throw new Error(`unhandled github fetch: ${u}`);
  }) as unknown as typeof fetch;
}

describe("RoadmapSourceService", () => {
  let dir: string;
  let levelMappingFile: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-source-"));
    levelMappingFile = path.join(dir, "_level-mapping.json");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe("a project with no Jira/GitHub integration", () => {
    it("returns an all-zero summary, never an error", async () => {
      const { service } = await buildService({
        dir,
        levelMappingFile,
        integrations: [],
        fetchImpl: (async () => {
          throw new Error("must not fetch anything");
        }) as unknown as typeof fetch,
      });
      const result = await service.sync(PROJECT.id);
      expect(result).toEqual({ imported: 0, updated: 0, archived: 0, skipped: 0, notes: [] });
    });
  });

  describe("an unknown project id", () => {
    it("propagates ProjectNotFoundError", async () => {
      const { service } = await buildService({
        dir,
        levelMappingFile,
        integrations: [],
        fetchImpl: (async () => {
          throw new Error("must not fetch anything");
        }) as unknown as typeof fetch,
      });
      await expect(service.sync("nonexistent")).rejects.toBeInstanceOf(ProjectNotFoundError);
    });
  });

  describe("Jira", () => {
    it("imports epic/task hierarchy, ADF descriptions, both issuelink directions, and attachments (with an oversize skip note)", async () => {
      const state = { issues: jiraIssuesFull };
      const { service, roadmap } = await buildService({
        dir,
        levelMappingFile,
        integrations: [JIRA_INTEGRATION],
        fetchImpl: jiraFetch(state),
      });

      const result = await service.sync(PROJECT.id);
      expect(result.imported).toBe(4);
      expect(result.updated).toBe(0);
      expect(result.archived).toBe(0);
      expect(result.skipped).toBe(0);

      const items = await roadmap.list(PROJECT.id);
      expect(items).toHaveLength(4);

      const epicId = roadmapItemIdForSource(JIRA_INTEGRATION.id, "PROJ-1");
      const storyAId = roadmapItemIdForSource(JIRA_INTEGRATION.id, "PROJ-2");
      const storyBId = roadmapItemIdForSource(JIRA_INTEGRATION.id, "PROJ-3");
      const subtaskId = roadmapItemIdForSource(JIRA_INTEGRATION.id, "PROJ-4");

      const epic = await roadmap.get(PROJECT.id, epicId);
      expect(epic.level).toBe("epic");
      expect(epic.description).toBe("Epic body");
      expect(epic.lifecycle).toBe("todo");
      // Oversize attachment skipped, the other one downloaded and kept.
      expect(epic.attachments).toEqual([
        { name: "spec.pdf", size: 1234, mediaType: "application/pdf" },
      ]);
      expect(epic.attachmentSetId).toBeDefined();
      expect(epic.syncNotes.join(" ")).toMatch(/huge\.zip/);
      expect(epic.syncNotes.join(" ")).toMatch(/25 MB/);

      const storyA = await roadmap.get(PROJECT.id, storyAId);
      expect(storyA.level).toBe("task");
      expect(storyA.parentId).toBe(epicId);
      expect(storyA.lifecycle).toBe("done"); // Jira status Done
      // Direction check: PROJ-2 IS BLOCKED BY PROJ-3 (`inwardIssue`) -> depends on it.
      expect(storyA.dependsOnFromSource).toEqual([storyBId]);
      expect(storyA.dependsOn).toEqual([storyBId]);

      const storyB = await roadmap.get(PROJECT.id, storyBId);
      expect(storyB.level).toBe("task");
      expect(storyB.parentId).toBe(epicId);
      expect(storyB.lifecycle).toBe("todo");
      // Direction check: PROJ-3 BLOCKS PROJ-2 (`outwardIssue`) — PROJ-3 must
      // NOT come out depending on PROJ-2 (the inverted-edge bug).
      expect(storyB.dependsOnFromSource).toEqual([]);

      const subtask = await roadmap.get(PROJECT.id, subtaskId);
      expect(subtask.level).toBe("task");
      // Sub-task flattens to task and inherits the PARENT'S EPIC (walks
      // PROJ-4 -> PROJ-2 (task) -> PROJ-1 (epic)), not its immediate parent.
      expect(subtask.parentId).toBe(epicId);
    });

    it("is idempotent: a second sync updates the same 4 items rather than duplicating them, and does not re-download an unchanged attachment", async () => {
      const state = { issues: jiraIssuesFull };
      const { service, roadmap, attachmentSave } = await buildService({
        dir,
        levelMappingFile,
        integrations: [JIRA_INTEGRATION],
        fetchImpl: jiraFetch(state),
      });

      const first = await service.sync(PROJECT.id);
      expect(first.imported).toBe(4);
      expect(attachmentSave).toHaveBeenCalledTimes(1);

      const second = await service.sync(PROJECT.id);
      expect(second.imported).toBe(0);
      expect(second.updated).toBe(4);
      expect(second.archived).toBe(0);

      const items = await roadmap.list(PROJECT.id);
      expect(items).toHaveLength(4);
      // Re-sync with an unchanged attachment list must not re-download bytes.
      expect(attachmentSave).toHaveBeenCalledTimes(1);
    });

    it("ownership split: a re-sync never touches lifecycle/runs/overrideBlocked or a manual dependsOn edge", async () => {
      const state = { issues: jiraIssuesFull };
      const { service, roadmap } = await buildService({
        dir,
        levelMappingFile,
        integrations: [JIRA_INTEGRATION],
        fetchImpl: jiraFetch(state),
      });

      await service.sync(PROJECT.id);
      const storyBId = roadmapItemIdForSource(JIRA_INTEGRATION.id, "PROJ-3");

      // Simulate later sub-phases (125e) having advanced this item, plus an
      // operator-added manual dependency.
      const run = {
        taskId: "task_1",
        startedAt: "2026-07-28T00:00:00.000Z",
        outcome: "running" as const,
      };
      await roadmap.update(PROJECT.id, storyBId, (current) => ({
        ...current,
        lifecycle: "running",
        runs: [run],
        overrideBlocked: true,
        dependsOn: [...current.dependsOn, "manual-dep-xyz"],
      }));

      await service.sync(PROJECT.id);

      const after = await roadmap.get(PROJECT.id, storyBId);
      expect(after.lifecycle).toBe("running");
      expect(after.runs).toEqual([run]);
      expect(after.overrideBlocked).toBe(true);
      expect(after.dependsOn).toContain("manual-dep-xyz");
    });

    it("archives an item the source no longer returns, without deleting it", async () => {
      const state = { issues: jiraIssuesFull };
      const { service, roadmap } = await buildService({
        dir,
        levelMappingFile,
        integrations: [JIRA_INTEGRATION],
        fetchImpl: jiraFetch(state),
      });

      await service.sync(PROJECT.id);
      const subtaskId = roadmapItemIdForSource(JIRA_INTEGRATION.id, "PROJ-4");

      // The source stops returning PROJ-4 (e.g. deleted upstream).
      state.issues = jiraIssuesFull.filter((issue) => issue.key !== "PROJ-4");
      const result = await service.sync(PROJECT.id);
      expect(result.archived).toBe(1);

      const archived = await roadmap.get(PROJECT.id, subtaskId);
      expect(archived.lifecycle).toBe("archived");

      const items = await roadmap.list(PROJECT.id);
      expect(items.map((item) => item.id)).toContain(subtaskId); // never deleted
    });
  });

  describe("GitHub", () => {
    it("filters PRs, imports milestones as epics, and parses Depends on #N (tolerating a 404 sub_issues)", async () => {
      const state = { issues: githubIssuesFull, milestones: githubMilestonesFull };
      const { service, roadmap } = await buildService({
        dir,
        levelMappingFile,
        integrations: [GITHUB_INTEGRATION],
        fetchImpl: githubFetch(state),
      });

      const result = await service.sync(PROJECT.id);
      expect(result.imported).toBe(4); // 1 milestone + 3 issues; #99 (a PR) excluded
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);

      const items = await roadmap.list(PROJECT.id);
      expect(items).toHaveLength(4);

      const milestoneId = roadmapItemIdForSource(GITHUB_INTEGRATION.id, "milestone:1");
      const issue10Id = roadmapItemIdForSource(GITHUB_INTEGRATION.id, "issue:10");
      const issue11Id = roadmapItemIdForSource(GITHUB_INTEGRATION.id, "issue:11");
      const issue12Id = roadmapItemIdForSource(GITHUB_INTEGRATION.id, "issue:12");
      const prExternalId = roadmapItemIdForSource(GITHUB_INTEGRATION.id, "issue:99");

      const milestone = await roadmap.get(PROJECT.id, milestoneId);
      expect(milestone.level).toBe("epic");
      expect(milestone.lifecycle).toBe("todo");

      const issue10 = await roadmap.get(PROJECT.id, issue10Id);
      expect(issue10.level).toBe("task");
      expect(issue10.parentId).toBe(milestoneId);
      // "Depends on #11 and blocked by #12" — both numbers picked up.
      expect(new Set(issue10.dependsOnFromSource)).toEqual(new Set([issue11Id, issue12Id]));

      const issue11 = await roadmap.get(PROJECT.id, issue11Id);
      expect(issue11.lifecycle).toBe("done"); // GitHub state: closed

      const issue12 = await roadmap.get(PROJECT.id, issue12Id);
      expect(issue12.lifecycle).toBe("todo");

      await expect(roadmap.get(PROJECT.id, prExternalId)).rejects.toThrow();
    });
  });
});
