import { describe, expect, it } from "vitest";
import { CiStatusSchema, MonitorEventSchema, MonitorEventsQuerySchema } from "./monitor.schema";
import { monitorsContract } from "./monitors.contract";

const VALID = {
  id: "ci-acme-app-42-1",
  integrationId: "acme-github",
  projectId: "acme",
  kind: "ci-run-failed",
  title: "CI red: build.yml failed on main",
  detail: "Conclusion: failure",
  url: "https://github.com/acme/app/actions/runs/42",
  occurredAt: "2026-07-02T08:12:00.000Z",
  state: "new",
};

describe("monitor.schema", () => {
  it("round-trips a full event; kind and state are closed vocabularies", () => {
    expect(MonitorEventSchema.parse(VALID)).toEqual(VALID);
    expect(MonitorEventSchema.safeParse({ ...VALID, kind: "meteor-strike" }).success).toBe(false);
    expect(MonitorEventSchema.safeParse({ ...VALID, state: "done" }).success).toBe(false);
  });

  it("query filters are optional; empty strings rejected", () => {
    expect(MonitorEventsQuerySchema.parse({})).toEqual({});
    expect(MonitorEventsQuerySchema.safeParse({ projectId: "" }).success).toBe(false);
  });

  it("caps detail at 4000 chars (T11 finding #16): 4000 passes, 4001 rejects", () => {
    expect(MonitorEventSchema.safeParse({ ...VALID, detail: "x".repeat(4000) }).success).toBe(true);
    expect(MonitorEventSchema.safeParse({ ...VALID, detail: "x".repeat(4001) }).success).toBe(
      false,
    );
  });

  // NS2 F7a — Sentry's event kind, the second member of the closed vocabulary.
  it("error-unresolved parses in MonitorEventKindSchema; a full event round-trips", () => {
    const sentryEvent = {
      ...VALID,
      id: "sentry-acme-backend-123",
      integrationId: "acme-sentry",
      kind: "error-unresolved",
      title: "Sentry: TypeError in checkout",
      detail: "Project: backend\nLevel: error\nCulprit: checkout()\nCount: 12",
    };
    expect(MonitorEventSchema.parse(sentryEvent)).toEqual(sentryEvent);
  });

  it("N4b: CiStatus round-trips; state is a closed red/green vocabulary", () => {
    const status = {
      integrationId: "acme-github",
      projectId: "acme",
      adapterKind: "github-ci",
      state: "red",
      sinceAt: "2026-07-02T08:00:00.000Z",
      checkedAt: "2026-07-02T08:12:00.000Z",
      summary: "build.yml failed on main",
      url: "https://github.com/acme/app/actions/runs/42",
    };
    expect(CiStatusSchema.parse(status)).toEqual(status);
    expect(CiStatusSchema.safeParse({ ...status, state: "amber" }).success).toBe(false);
  });
});

describe("monitorsContract", () => {
  it("is read-only under /api/monitors (alerts and statuses are born only inside the API)", () => {
    expect(Object.keys(monitorsContract)).toEqual([
      "listMonitorEvents",
      "getMonitorEvent",
      "listCiStatus",
    ]);
    expect(monitorsContract.listMonitorEvents.method).toBe("GET");
    expect(monitorsContract.listMonitorEvents.path).toBe("/api/monitors/events");
    expect(monitorsContract.getMonitorEvent.path).toBe("/api/monitors/events/:id");
    expect(monitorsContract.listCiStatus.method).toBe("GET");
    expect(monitorsContract.listCiStatus.path).toBe("/api/monitors/status");
  });
});
