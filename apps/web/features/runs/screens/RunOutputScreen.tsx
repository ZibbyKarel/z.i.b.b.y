"use client";

import { CodeBlock, Container, EmptyState, Markdown, Panel } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useRunArtifactQuery } from "../queries/useRunArtifactQuery";
import { useTaskRunQuery } from "../queries/useTaskRunQuery";
import { isMarkdownFilename } from "../run";

export interface RunOutputScreenProps {
  runId: string;
}

/**
 * `/activity/runs/[runId]/output` — a run's produced output on its own page, the
 * target of the task detail's "open output" (opened in a new window): a workflow's
 * `file` artifact, or an agent's `file` output (its outcome summary — the exact
 * content the sink wrote). PRs and vault notes open at their own home instead.
 */
export function RunOutputScreen({ runId }: RunOutputScreenProps) {
  const t = useTranslations("runs");
  const { data: run, isPending, isError, refetch } = useTaskRunQuery(runId);
  const artifactName = run?.kind === "workflow" ? run.outputArtifactName : undefined;
  const artifact = useRunArtifactQuery(runId, artifactName ?? "", !!artifactName);

  if (isPending || (artifactName && artifact.isPending)) {
    return (
      <Container padding={["300", "350"]}>
        <QueryLoading />
      </Container>
    );
  }

  if (isError || !run) {
    return (
      <Container padding={["300", "350"]}>
        <QueryError onRetry={() => void refetch()} />
      </Container>
    );
  }

  const content = artifactName ? artifact.data?.content : run.taskOutcomeSummary;

  return (
    <Container padding={["300", "350"]}>
      <Panel header={artifactName ?? t("producedOutputTitle")} padding="300">
        {!content ? (
          <EmptyState title={t("outputEmpty")} />
        ) : isMarkdownFilename(artifactName) ? (
          <Markdown escapeHtml source={content} />
        ) : (
          <CodeBlock text={content} />
        )}
      </Panel>
    </Container>
  );
}
