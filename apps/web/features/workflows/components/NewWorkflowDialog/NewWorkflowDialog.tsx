"use client";
import type { Agent, CreateWorkflowInput, DepartmentId } from "@zibby/contracts";
import { WorkflowDialog } from "../WorkflowDialog/WorkflowDialog";

export interface NewWorkflowDialogProps {
  agents: Agent[];
  /** Disables the submit while the create request is in flight. */
  isPending?: boolean;
  onClose: () => void;
  onCreate: (input: CreateWorkflowInput) => void;
  /** Pre-fills the created workflow's `department` (Phase 85 Roster tab). */
  defaultOwnerDepartment?: DepartmentId;
}

/**
 * The "New workflow" dialog — a thin create-mode wrapper over the shared
 * {@link WorkflowDialog} (which also powers editing), kept so existing imports
 * and tests stay stable.
 */
export function NewWorkflowDialog({
  agents,
  isPending = false,
  onClose,
  onCreate,
  defaultOwnerDepartment,
}: NewWorkflowDialogProps) {
  return (
    <WorkflowDialog
      agents={agents}
      defaultOwnerDepartment={defaultOwnerDepartment}
      isPending={isPending}
      mode="create"
      onClose={onClose}
      onCreate={onCreate}
    />
  );
}
