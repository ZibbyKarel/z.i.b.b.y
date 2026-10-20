"use client";

import {
  Button,
  Card,
  CodeBlock,
  Container,
  DiffstatList,
  FileTreeList,
  Markdown,
  Panel,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRunArtifactQuery } from "../queries/useRunArtifactQuery";
import { useTaskRunFilesQuery } from "../queries/useTaskRunFilesQuery";
import { type RunView, isMarkdownFilename, runOutputHref, runTitle } from "../run";
import { MODE_TONE, type RunMode } from "../runDetailModel";

export enum RunOutputViewTestId {
  Root = "run-output-view",
  Title = "run-output-title",
  Pending = "run-output-pending",
  Open = "run-output-open",
  ContinueTask = "run-output-continue",
}

export type RunOutputKind = "pr" | "markdown" | "folder";

/** pr: an opened PR or a pending PR-gate diffstat; markdown: a named artifact / agent file output; else the run folder. */
export function runOutputKind(run: RunView): RunOutputKind {
  if (run.prOutput || run.diffstat) return "pr";
  if (run.outputArtifactName) return "markdown";
  if (run.kind !== "workflow" && run.taskOutputKind === "file" && run.taskOutcomeSummary)
    return "markdown";
  return "folder";
}

export interface RunOutputViewProps {
  run: RunView;
  mode: RunMode;
  onOpenFolder?: () => void;
  onContinueTask: () => void;
}

/** How much produced output is folded into a follow-up task's context (8000-char cap). */
const CONTINUE_CONTEXT_MAX = 1500;

/** The produced text a follow-up task carries: the workflow's artifact (draft or named file), or an agent's summary. */
function useOutputText(run: RunView): string | undefined {
  const workflowDone = run.status === "done" && run.kind === "workflow";
  const { data: prDraft } = useRunArtifactQuery(run.runId, "pr-draft.md", workflowDone);
  const { data: fileArtifact } = useRunArtifactQuery(
    run.runId,
    run.outputArtifactName ?? "",
    workflowDone && !!run.outputArtifactName,
  );
  if (workflowDone) return fileArtifact?.content ?? prDraft?.content;
  if (run.status === "done" && (run.taskOutputKind === "pr" || run.taskOutputKind === "file"))
    return run.taskOutcomeSummary;
  return undefined;
}

/**
 * The New Task context for "continue task": the task's title plus its produced output,
 * capped at {@link CONTINUE_CONTEXT_MAX}. Shared by the OUTPUT view, the header action
 * and the done-mode composer (same query keys, so one fetch).
 */
export function useContinueTaskContext(run: RunView): string {
  const t = useTranslations("runs");
  const raw = useOutputText(run) ?? "";
  const output = raw.length > CONTINUE_CONTEXT_MAX ? `${raw.slice(0, CONTINUE_CONTEXT_MAX)}…` : raw;
  return [
    run.taskTitle ? t("continueContextTask", { title: run.taskTitle }) : null,
    output ? t("continueContextOutput", { output }) : null,
  ]
    .filter(Boolean)
    .join("\n");
}

const pad2 = (n: number) => String(n).padStart(2, "0");

const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

/** The OUTPUT view: title row + actions, a pending notice while the run is not done, then the output body. */
export function RunOutputView({ run, mode, onOpenFolder, onContinueTask }: RunOutputViewProps) {
  const t = useTranslations("runs.detail");
  const kind = runOutputKind(run);
  const workflow = run.kind === "workflow";

  const { data: prDraft } = useRunArtifactQuery(
    run.runId,
    "pr-draft.md",
    kind === "pr" && workflow,
  );
  const { data: artifact } = useRunArtifactQuery(
    run.runId,
    run.outputArtifactName ?? "",
    kind === "markdown" && workflow && !!run.outputArtifactName,
  );
  const { data: files } = useTaskRunFilesQuery(run.runId, kind === "folder" && workflow);

  const diffFiles = run.diffstat?.files ?? run.prOutput?.files ?? [];
  const href = runOutputHref(run);

  let title: string;
  let meta: string | null = null;
  let action: { label: string; onClick: () => void } | null = null;
  if (kind === "pr") {
    const n = run.prOutput?.url.match(/\/pull\/(\d+)/)?.[1];
    title = n ? t("output.prTitle", { n }) : runTitle(run);
    meta = t("output.prMeta", {
      state: t(`mode.${mode}`),
      files: pad2(diffFiles.length),
      add: run.diffstat?.additions ?? run.prOutput?.additions ?? 0,
      del: run.diffstat?.deletions ?? run.prOutput?.deletions ?? 0,
    });
    const url = run.prOutput?.url;
    if (url) action = { label: t("output.openPr"), onClick: () => open(url) };
  } else if (kind === "markdown") {
    title = run.outputArtifactName ?? runTitle(run);
    if (href) action = { label: t("output.openOutput"), onClick: () => open(href) };
  } else {
    title = `${run.taskId ?? run.runId}/`;
    if (files) {
      meta = t("output.folderMeta", {
        n: pad2(files.entries.filter((e) => e.kind === "file").length),
      });
    }
    if (onOpenFolder) action = { label: t("output.openFolder"), onClick: onOpenFolder };
  }

  const markdownSource = workflow ? artifact?.content : run.taskOutcomeSummary;
  const pendingKey =
    mode === "running" || mode === "pausing"
      ? "running"
      : mode === "error"
        ? "stopped"
        : mode === "approval" ||
            mode === "question" ||
            mode === "paused" ||
            mode === "parked" ||
            mode === "stopped"
          ? mode
          : null;

  return (
    <Stack data-testid={RunOutputViewTestId.Root} gap="150">
      <Stack wrap align="center" direction="row" gap="125">
        <Typography data-testid={RunOutputViewTestId.Title} type="title">
          {title}
        </Typography>
        {meta && (
          <Typography as="span" type="labelSm">
            {meta}
          </Typography>
        )}
        <Container grow />
        <Stack direction="row" gap="75">
          {action && (
            <Button
              data-testid={RunOutputViewTestId.Open}
              intent="secondary"
              onClick={action.onClick}
              size="sm"
            >
              {action.label}
            </Button>
          )}
          {mode === "done" && (
            <Button
              data-testid={RunOutputViewTestId.ContinueTask}
              intent="primary"
              onClick={onContinueTask}
              size="sm"
            >
              {t("action.continueTask")}
            </Button>
          )}
        </Stack>
      </Stack>

      {pendingKey && (
        <Card borderStyle="dashed" data-testid={RunOutputViewTestId.Pending}>
          <Container padding={["100", "150"]}>
            <Stack align="center" direction="row" gap="100">
              <StatusDot size="75" tone={MODE_TONE[mode]} />
              <Typography as="span" type="labelSm" variant="secondary">
                {t(`output.pending.${pendingKey}`)}
              </Typography>
            </Stack>
          </Container>
        </Card>
      )}

      {kind === "pr" && (
        <Stack gap="125">
          {prDraft?.content && (
            <Container maxWidth="760px">
              <Markdown escapeHtml source={prDraft.content} />
            </Container>
          )}
          {diffFiles.length > 0 && <DiffstatList density="table" files={diffFiles} />}
        </Stack>
      )}

      {kind === "markdown" && markdownSource && (
        <Container maxWidth="760px">
          <Panel padding="250">
            {workflow && !isMarkdownFilename(run.outputArtifactName) ? (
              <CodeBlock maxHeight="md" text={markdownSource} />
            ) : (
              <Markdown escapeHtml source={markdownSource} />
            )}
          </Panel>
        </Container>
      )}

      {kind === "folder" && files && files.entries.length > 0 && (
        <FileTreeList
          entries={files.entries.map((e) => ({
            path: e.path,
            kind: e.kind,
            size: e.kind === "file" ? formatBytes(e.size) : "",
            when: "",
          }))}
        />
      )}
    </Stack>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
