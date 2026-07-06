import { describe, expect, it } from "vitest";
import { ApprovalRunKindSchema } from "../approvals/approval.schema";
import { ActivityKindSchema } from "../activity/activity.schema";
import { ACTIVITY_GROUP_OF } from "../activity/activity-view.schema";
import { MachineActionRecordSchema, MachineActionSchema } from "./machine.schema";
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

  it("the machine approval kind and machine-action activity kind are wired", () => {
    expect(ApprovalRunKindSchema.safeParse("machine").success).toBe(true);
    expect(ActivityKindSchema.safeParse("machine-action").success).toBe(true);
    expect(ACTIVITY_GROUP_OF["machine-action"]).toBe("approvals");
  });
});

describe("machineContract", () => {
  it("is propose + read-only — there is NO execute route (the gate is the only path)", () => {
    expect(Object.keys(machineContract)).toEqual([
      "proposeMachineAction",
      "listMachineActions",
      "getMachineAction",
    ]);
    expect(machineContract.proposeMachineAction.method).toBe("POST");
    expect(machineContract.proposeMachineAction.path).toBe("/api/machine/actions");
    expect(machineContract.listMachineActions.method).toBe("GET");
    expect(machineContract.getMachineAction.path).toBe("/api/machine/actions/:id");
  });
});
