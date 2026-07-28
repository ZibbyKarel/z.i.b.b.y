import { describe, expect, it } from "vitest";
import { roadmapContract } from "./roadmap.contract";

describe("roadmapContract", () => {
  it("exposes the per-project item CRUD routes", () => {
    expect(roadmapContract.listRoadmapItems.method).toBe("GET");
    expect(roadmapContract.listRoadmapItems.path).toBe("/api/projects/:projectId/roadmap");

    expect(roadmapContract.createRoadmapItem.method).toBe("POST");
    expect(roadmapContract.createRoadmapItem.path).toBe("/api/projects/:projectId/roadmap/items");
    expect(roadmapContract.createRoadmapItem.responses).toHaveProperty("201");
    expect(roadmapContract.createRoadmapItem.responses).toHaveProperty("409");
    expect(roadmapContract.createRoadmapItem.responses).toHaveProperty("422");

    expect(roadmapContract.getRoadmapItem.method).toBe("GET");
    expect(roadmapContract.getRoadmapItem.path).toBe(
      "/api/projects/:projectId/roadmap/items/:itemId",
    );
    expect(roadmapContract.updateRoadmapItem.method).toBe("PATCH");
    expect(roadmapContract.updateRoadmapItem.path).toBe(
      "/api/projects/:projectId/roadmap/items/:itemId",
    );
    expect(roadmapContract.deleteRoadmapItem.method).toBe("DELETE");
    expect(roadmapContract.deleteRoadmapItem.path).toBe(
      "/api/projects/:projectId/roadmap/items/:itemId",
    );
    expect(roadmapContract.deleteRoadmapItem.responses[200]).toBeDefined();
  });

  it("exposes the manual sync route", () => {
    expect(roadmapContract.syncRoadmapItems.method).toBe("POST");
    expect(roadmapContract.syncRoadmapItems.path).toBe("/api/projects/:projectId/roadmap/sync");
    expect(roadmapContract.syncRoadmapItems.responses).toHaveProperty("200");
    expect(roadmapContract.syncRoadmapItems.responses).toHaveProperty("404");
  });

  it("exposes the per-project config routes", () => {
    expect(roadmapContract.getRoadmapConfig.method).toBe("GET");
    expect(roadmapContract.getRoadmapConfig.path).toBe("/api/projects/:projectId/roadmap/config");
    expect(roadmapContract.putRoadmapConfig.method).toBe("PUT");
    expect(roadmapContract.putRoadmapConfig.path).toBe("/api/projects/:projectId/roadmap/config");
  });

  it("exposes the global level-mapping routes, not nested under a project", () => {
    expect(roadmapContract.getLevelMapping.method).toBe("GET");
    expect(roadmapContract.getLevelMapping.path).toBe("/api/roadmap/level-mapping");
    expect(roadmapContract.putLevelMapping.method).toBe("PUT");
    expect(roadmapContract.putLevelMapping.path).toBe("/api/roadmap/level-mapping");
  });

  it("declares the static /roadmap/items segment separately from the :itemId param route", () => {
    // Regression guard for route-ordering: the create route's path must not
    // itself look like a param-capturable suffix of the list route.
    expect(roadmapContract.createRoadmapItem.path.endsWith("/items")).toBe(true);
    expect(roadmapContract.getRoadmapItem.path.endsWith("/items/:itemId")).toBe(true);
  });
});
