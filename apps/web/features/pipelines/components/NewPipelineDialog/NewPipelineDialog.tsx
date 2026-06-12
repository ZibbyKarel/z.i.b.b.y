"use client";
import type { Agent, CreatePipelineInput } from "@zibby/contracts";
import { PipelineDialog } from "../PipelineDialog/PipelineDialog";

export interface NewPipelineDialogProps {
  agents: Agent[];
  /** Disables the submit while the create request is in flight. */
  isPending?: boolean;
  onClose: () => void;
  onCreate: (input: CreatePipelineInput) => void;
}

/**
 * The "New pipeline" dialog — a thin create-mode wrapper over the shared
 * {@link PipelineDialog} (which also powers editing), kept so existing imports
 * and tests stay stable.
 */
export function NewPipelineDialog({
  agents,
  isPending = false,
  onClose,
  onCreate,
}: NewPipelineDialogProps) {
  return (
    <PipelineDialog
      agents={agents}
      isPending={isPending}
      mode="create"
      onClose={onClose}
      onCreate={onCreate}
    />
  );
}
