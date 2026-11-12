import { useQueryClient } from "@tanstack/react-query";
import type { CreateWorkflowInput } from "@zibby/contracts";
import type { Workflow } from "../../../domain";
import { apiClient } from "../../../state/api";
import { getWorkflowsQueryKey } from "../queries/useWorkflowsQuery";

/**
 * Duplicate = client-side create with a copied body + a derived unique id (no
 * dedicated endpoint; create already 409s on a collision). The body is built by
 * {@link duplicateWorkflowBody}; this hook is the plain create mutation with
 * list invalidation, named for the call-site's intent.
 */
export function useDuplicateWorkflowMutation() {
  const qc = useQueryClient();
  return apiClient.workflows.createWorkflow.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getWorkflowsQueryKey() }),
  });
}

/** First `<base>-copy`, then `<base>-copy-2`, … that is not already taken. */
export function duplicateWorkflowId(baseId: string, existingIds: readonly string[]): string {
  const taken = new Set(existingIds);
  let candidate = `${baseId}-copy`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${baseId}-copy-${n}`;
  return candidate;
}

const DISPLAY_ONLY = ["lastRun", "lastState", "file"];

/**
 * Project a (domain) workflow to the create body of its copy. The dashboard's
 * domain model carries no separate `instructions` (the authoring dialog writes
 * the description there too), so the copy follows the same convention.
 */
export function duplicateWorkflowBody(
  workflow: Workflow,
  existingIds: readonly string[],
): CreateWorkflowInput {
  const id = duplicateWorkflowId(workflow.id, existingIds);
  // Spread so every contract field rides along (a new one cannot be dropped); strip only the
  // display-only run-history fields.
  const contract = Object.fromEntries(
    Object.entries(workflow).filter(([k]) => !DISPLAY_ONLY.includes(k)),
  ) as Omit<Workflow, "lastRun" | "lastState" | "file">;
  return {
    ...contract,
    id,
    name: `${workflow.name} (copy)`,
    instructions: workflow.desc || workflow.name || id,
    phases: workflow.phases.map((ph, i) => ({ ...ph, id: ph.id ?? `phase-${i + 1}` })),
    // NS2 F9: `POST /api/workflows` 422s without a `department`, and `complexity` is
    // schema-defaulted — omitting it would silently reset a `light`/`deep` copy to "standard".
    complexity: workflow.complexity ?? "standard",
  };
}
