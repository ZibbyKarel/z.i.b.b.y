import { useQueryClient } from "@tanstack/react-query";
import type { CreatePipelineInput } from "@zibby/contracts";
import type { Pipeline } from "../../../domain";
import { apiClient } from "../../../state/api";
import { getPipelinesQueryKey } from "../queries/usePipelinesQuery";

/**
 * Duplicate = client-side create with a copied body + a derived unique id (no
 * dedicated endpoint; create already 409s on a collision). The body is built by
 * {@link duplicatePipelineBody}; this hook is the plain create mutation with
 * list invalidation, named for the call-site's intent.
 */
export function useDuplicatePipelineMutation() {
  const qc = useQueryClient();
  return apiClient.pipelines.createPipeline.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getPipelinesQueryKey() }),
  });
}

/** First `<base>-copy`, then `<base>-copy-2`, … that is not already taken. */
export function duplicatePipelineId(baseId: string, existingIds: readonly string[]): string {
  const taken = new Set(existingIds);
  let candidate = `${baseId}-copy`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${baseId}-copy-${n}`;
  return candidate;
}

/**
 * Project a (domain) pipeline to the create body of its copy. The dashboard's
 * domain model carries no separate `instructions` (the authoring dialog writes
 * the description there too), so the copy follows the same convention.
 */
export function duplicatePipelineBody(
  pipeline: Pipeline,
  existingIds: readonly string[],
): CreatePipelineInput {
  const id = duplicatePipelineId(pipeline.id, existingIds);
  return {
    id,
    name: `${pipeline.name} (copy)`,
    ...(pipeline.desc ? { desc: pipeline.desc } : {}),
    instructions: pipeline.desc || pipeline.name || id,
    phases: pipeline.phases.map((ph, i) => ({
      id: ph.id ?? `phase-${i + 1}`,
      type: ph.type,
      ...(ph.agent ? { agent: ph.agent } : {}),
      ...(ph.consumes ? { consumes: ph.consumes } : {}),
      ...(ph.produces ? { produces: ph.produces } : {}),
      ...(ph.model ? { model: ph.model } : {}),
      ...(ph.thinking ? { thinking: ph.thinking } : {}),
      ...(ph.commands ? { commands: ph.commands } : {}),
      ...(ph.loop ? { loop: ph.loop } : {}),
    })),
  };
}
