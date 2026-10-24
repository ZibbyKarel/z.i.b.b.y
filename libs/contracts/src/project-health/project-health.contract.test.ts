import { describe, expect, it } from "vitest";
import { ACTIVITY_GROUP_OF } from "../activity/activity-view.schema";
import { ActivityKindSchema } from "../activity/activity.schema";
import { WatcherIdSchema } from "../health/health.schema";
import {
  ProjectHealthCheckSchema,
  ProjectSchema,
  UpdateProjectSchema,
} from "../projects/project.schema";
import { SystemConfigSchema } from "../system/system.schema";
import { projectHealthContract } from "./project-health.contract";
import { ProjectHealthStatusSchema } from "./project-health.schema";

describe("ProjectHealthCheckSchema", () => {
  it("accepts http(s) urls and defaults intervalSec to 300", () => {
    expect(ProjectHealthCheckSchema.parse({ url: "https://acme.dev/health" })).toEqual({
      url: "https://acme.dev/health",
      intervalSec: 300,
    });
    expect(
      ProjectHealthCheckSchema.safeParse({ url: "http://localhost:3333/api/health" }).success,
    ).toBe(true);
  });

  it("rejects non-http schemes (ftp:, javascript:, file:)", () => {
    for (const url of ["ftp://acme.dev/health", "javascript:alert(1)", "file:///etc/passwd"]) {
      expect(ProjectHealthCheckSchema.safeParse({ url }).success).toBe(false);
    }
  });

  it("bounds intervalSec to 30..3600 integer seconds", () => {
    const at = (intervalSec: number) =>
      ProjectHealthCheckSchema.safeParse({ url: "https://acme.dev/h", intervalSec }).success;
    expect(at(30)).toBe(true);
    expect(at(3600)).toBe(true);
    expect(at(29)).toBe(false);
    expect(at(3601)).toBe(false);
    expect(at(60.5)).toBe(false);
  });

  it("is strict — an unknown key is rejected", () => {
    expect(
      ProjectHealthCheckSchema.safeParse({ url: "https://acme.dev/h", method: "POST" }).success,
    ).toBe(false);
  });

  it("rides ProjectSchema as an optional field", () => {
    expect(ProjectSchema.safeParse({ id: "acme", name: "Acme" }).success).toBe(true);
    const parsed = ProjectSchema.parse({
      id: "acme",
      name: "Acme",
      healthCheck: { url: "https://acme.dev/h", intervalSec: 60 },
    });
    expect(parsed.healthCheck).toEqual({ url: "https://acme.dev/h", intervalSec: 60 });
  });

  it("UpdateProjectSchema accepts null (clear), a value, or absent", () => {
    expect(UpdateProjectSchema.parse({ healthCheck: null })).toEqual({ healthCheck: null });
    expect(UpdateProjectSchema.parse({}).healthCheck).toBeUndefined();
    expect(UpdateProjectSchema.parse({ healthCheck: { url: "https://acme.dev/h" } })).toEqual({
      healthCheck: { url: "https://acme.dev/h", intervalSec: 300 },
    });
    expect(UpdateProjectSchema.safeParse({ healthCheck: { url: "ftp://x" } }).success).toBe(false);
  });
});

const STATUS = {
  projectId: "acme",
  url: "https://acme.dev/health",
  state: "down",
  sinceAt: "2026-10-24T08:00:00.000Z",
  checkedAt: "2026-10-24T08:05:00.000Z",
  httpStatus: 503,
  latencyMs: 42,
  error: "HTTP 503",
  analysisTaskId: "task_1",
};

describe("ProjectHealthStatusSchema", () => {
  it("round-trips a full status; state is a closed up/down vocabulary", () => {
    expect(ProjectHealthStatusSchema.parse(STATUS)).toEqual(STATUS);
    expect(ProjectHealthStatusSchema.safeParse({ ...STATUS, state: "amber" }).success).toBe(false);
  });

  it("caps error at 500 chars", () => {
    expect(ProjectHealthStatusSchema.safeParse({ ...STATUS, error: "x".repeat(500) }).success).toBe(
      true,
    );
    expect(ProjectHealthStatusSchema.safeParse({ ...STATUS, error: "x".repeat(501) }).success).toBe(
      false,
    );
  });

  it("optional fields may be absent", () => {
    const minimal = {
      projectId: STATUS.projectId,
      url: STATUS.url,
      state: "up",
      sinceAt: STATUS.sinceAt,
      checkedAt: STATUS.checkedAt,
    };
    expect(ProjectHealthStatusSchema.safeParse(minimal).success).toBe(true);
  });
});

describe("projectHealthContract", () => {
  it("exposes list / analyze / check under /api/project-health", () => {
    expect(Object.keys(projectHealthContract)).toEqual([
      "listProjectHealth",
      "analyzeProjectHealth",
      "checkProjectHealth",
    ]);
    expect(projectHealthContract.listProjectHealth.method).toBe("GET");
    expect(projectHealthContract.listProjectHealth.path).toBe("/api/project-health");
    expect(projectHealthContract.analyzeProjectHealth.method).toBe("POST");
    expect(projectHealthContract.analyzeProjectHealth.path).toBe(
      "/api/project-health/:projectId/analyze",
    );
    expect(projectHealthContract.checkProjectHealth.method).toBe("POST");
    expect(projectHealthContract.checkProjectHealth.path).toBe(
      "/api/project-health/:projectId/check",
    );
  });
});

describe("project-health wiring in shared vocabularies", () => {
  it("adds the two activity kinds, grouped under integrations", () => {
    for (const kind of ["project-health-down", "project-health-recovered"] as const) {
      expect(ActivityKindSchema.safeParse(kind).success).toBe(true);
      expect(ACTIVITY_GROUP_OF[kind]).toBe("integrations");
    }
  });

  it("adds the project-health watcher id and a 30s default tick", () => {
    expect(WatcherIdSchema.safeParse("project-health").success).toBe(true);
    expect(SystemConfigSchema.parse({}).projectHealthTickMs).toBe(30_000);
    expect(SystemConfigSchema.safeParse({ projectHealthTickMs: -1 }).success).toBe(false);
  });
});
