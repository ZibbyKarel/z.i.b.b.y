import { describe, expect, it } from "vitest";
import { ApprovalRunKindSchema } from "../approvals/approval.schema";
import { ActivityKindSchema } from "../activity/activity.schema";
import { ACTIVITY_GROUP_OF } from "../activity/activity-view.schema";
import {
  MachineActionRecordSchema,
  MachineActionSchema,
  MachineConfigSchema,
  UpdateMachineConfigSchema,
} from "./machine.schema";
import { machineContract } from "./machine.contract";

const ACTION = {
  kind: "rename-files",
  folder: "/Users/op/Downloads/fotky",
  find: "IMG_",
  replace: "vylet-",
};

describe("machine.schema (N5a)", () => {
  it("round-trips a record; action kind and state are closed vocabularies", () => {
    const record = {
      id: "machine-1-abc",
      action: ACTION,
      preview: [{ from: "IMG_1.jpg", to: "vylet-1.jpg" }],
      state: "proposed",
      approvalId: "machine_1",
      requestedAt: "2026-07-02T10:00:00.000Z",
    };
    expect(MachineActionRecordSchema.parse(record)).toEqual(record);
    // N5b: the second reference task joins the closed union.
    expect(MachineActionSchema.safeParse({ kind: "open-maps", query: "Brno" }).success).toBe(true);
    expect(MachineActionSchema.safeParse({ kind: "open-maps", query: "" }).success).toBe(false);
    // N5c: the third reference task — open a folder — joins the closed union.
    expect(
      MachineActionSchema.safeParse({ kind: "open-folder", path: "/Users/op/Downloads" }).success,
    ).toBe(true);
    expect(MachineActionSchema.safeParse({ kind: "open-folder", path: "" }).success).toBe(false);
    expect(MachineActionSchema.safeParse({ ...ACTION, kind: "format-disk" }).success).toBe(false);
    expect(MachineActionRecordSchema.safeParse({ ...record, state: "pending" }).success).toBe(
      false,
    );
  });

  it("T11 finding #17: folder/find/query/path cap at 2048 chars — 2048 passes, 2049 rejects", () => {
    expect(
      MachineActionSchema.safeParse({ ...ACTION, folder: "/x/".repeat(683) }).success, // 2049
    ).toBe(false);
    expect(
      MachineActionSchema.safeParse({ ...ACTION, folder: "/" + "x".repeat(2047) }).success, // 2048
    ).toBe(true);
    expect(
      MachineActionSchema.safeParse({ ...ACTION, find: "x".repeat(2049) }).success,
    ).toBe(false);
    expect(
      MachineActionSchema.safeParse({ ...ACTION, find: "x".repeat(2048) }).success,
    ).toBe(true);
    expect(
      MachineActionSchema.safeParse({ kind: "open-maps", query: "x".repeat(2049) }).success,
    ).toBe(false);
    expect(
      MachineActionSchema.safeParse({ kind: "open-maps", query: "x".repeat(2048) }).success,
    ).toBe(true);
    expect(
      MachineActionSchema.safeParse({ kind: "open-folder", path: "/" + "x".repeat(2048) })
        .success, // 2049
    ).toBe(false);
    expect(
      MachineActionSchema.safeParse({ kind: "open-folder", path: "/" + "x".repeat(2047) })
        .success, // 2048
    ).toBe(true);
  });

  it("the machine approval kind and machine-action activity kind are wired", () => {
    expect(ApprovalRunKindSchema.safeParse("machine").success).toBe(true);
    expect(ActivityKindSchema.safeParse("machine-action").success).toBe(true);
    expect(ACTIVITY_GROUP_OF["machine-action"]).toBe("approvals");
  });
});

describe("machineContract", () => {
  it("is propose + read-only for actions, plus per-machine config — there is NO execute route (the gate is the only path)", () => {
    expect(Object.keys(machineContract)).toEqual([
      "proposeMachineAction",
      "listMachineActions",
      "getMachineAction",
      "getMachineConfig",
      "updateMachineConfig",
    ]);
    expect(machineContract.proposeMachineAction.method).toBe("POST");
    expect(machineContract.proposeMachineAction.path).toBe("/api/machine/actions");
    expect(machineContract.listMachineActions.method).toBe("GET");
    expect(machineContract.getMachineAction.path).toBe("/api/machine/actions/:id");
  });

  it("exposes GET/PUT /api/machine/config (Phase 76)", () => {
    expect(machineContract.getMachineConfig.method).toBe("GET");
    expect(machineContract.getMachineConfig.path).toBe("/api/machine/config");
    expect(machineContract.updateMachineConfig.method).toBe("PUT");
    expect(machineContract.updateMachineConfig.path).toBe("/api/machine/config");
  });
});

describe("MachineConfigSchema (Phase 76)", () => {
  it("round-trips a config with cloneRoot", () => {
    const config = { cloneRoot: "/Users/op/Projects" };
    expect(MachineConfigSchema.parse(config)).toEqual(config);
  });

  it("rejects an empty cloneRoot and an unknown key (strict)", () => {
    expect(MachineConfigSchema.safeParse({ cloneRoot: "" }).success).toBe(false);
    expect(
      MachineConfigSchema.safeParse({ cloneRoot: "/x", extra: "nope" }).success,
    ).toBe(false);
  });

  it("UpdateMachineConfigSchema accepts a partial (empty) patch", () => {
    expect(UpdateMachineConfigSchema.parse({})).toEqual({});
    expect(UpdateMachineConfigSchema.parse({ cloneRoot: "/x" })).toEqual({ cloneRoot: "/x" });
  });
});
