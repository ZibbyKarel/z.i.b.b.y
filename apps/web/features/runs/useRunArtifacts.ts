import { useWorkflowsQuery } from "../workflows";
import { useOpenTaskRunFolderMutation } from "./mutations";
import type { RunView } from "./run";

/** The `produces` of a workflow run's latest recorded phase (what a stage checkpoint reviews). */
export function latestProduces(
  run: Pick<RunView, "owner" | "stageRuns"> | undefined,
  workflows:
    | readonly { id: string; phases: readonly { id?: string; produces?: string }[] }[]
    | undefined,
): string | undefined {
  const phaseId = run?.stageRuns?.at(-1)?.phaseId;
  return workflows?.find((w) => w.id === run?.owner)?.phases.find((p) => p.id === phaseId)
    ?.produces;
}

/** One openable thing a run left behind: its PR (a link), a markdown artifact or its folder. */
export type RunArtifact =
  | { kind: "pr"; label: string; href: string }
  | { kind: "file" | "folder"; label: string; open: () => void };

/**
 * What the operator can open to inspect a run: the PR it opened, the latest phase's artifact
 * and the delivered file output (opened in the default app), and the run folder (Finder).
 * Files and folders exist only for workflow runs.
 */
export function useRunArtifacts(run: RunView | undefined): RunArtifact[] {
  const { data: workflows } = useWorkflowsQuery();
  const openMutation = useOpenTaskRunFolderMutation();
  if (!run) return [];
  const out: RunArtifact[] = [];
  const pr = run.prOutput?.url;
  if (pr) out.push({ kind: "pr", label: pr.replace(/^https?:\/\//, ""), href: pr });
  if (run.kind !== "workflow") return out;
  const open = (artifact?: string) => () =>
    openMutation.mutate({ params: { runId: run.runId }, body: artifact ? { artifact } : {} });
  const names = new Set(
    [latestProduces(run, workflows), run.outputArtifactName].filter((n): n is string => !!n),
  );
  for (const name of names) out.push({ kind: "file", label: name, open: open(name) });
  out.push({ kind: "folder", label: `${run.runId}/`, open: open() });
  return out;
}
