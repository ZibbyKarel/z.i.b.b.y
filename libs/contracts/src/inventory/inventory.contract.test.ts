import { describe, expect, it } from "vitest";
import { ACTIVITY_GROUP_OF } from "../activity/activity-view.schema";
import { ActivityKindSchema } from "../activity/activity.schema";
import { appContract } from "../app.contract";
import { inventoryContract } from "./inventory.contract";
import { InstallSkillResultSchema, MachineInventorySchema } from "./inventory.schema";

describe("inventoryContract", () => {
  it("is mounted on the app contract under /api/inventory", () => {
    expect(appContract.inventory.getInventory.path).toBe("/api/inventory");
    expect(inventoryContract.getInventory.path).toBe("/api/inventory");
    expect(inventoryContract.installSkill.path).toBe("/api/inventory/skills/:skillId/install");
  });

  it("parses an empty inventory and an install result", () => {
    expect(MachineInventorySchema.parse({ mcp: [], skills: [], plugins: [], catalog: [] })).toEqual(
      { mcp: [], skills: [], plugins: [], catalog: [] },
    );
    expect(InstallSkillResultSchema.parse({ skillId: "a", status: "installed" }).status).toBe(
      "installed",
    );
  });

  it("adds the skill-installed activity kind with a display group", () => {
    expect(ActivityKindSchema.options).toContain("skill-installed");
    expect(ACTIVITY_GROUP_OF["skill-installed"]).toBeDefined();
  });
});
