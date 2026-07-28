"use client";

import type { RoadmapItem, RoadmapItemRun, RoadmapRunOutcome } from "@zibby/contracts";
import {
  Button,
  Chip,
  Dialog,
  type DotTone,
  FilePreview,
  Icon,
  Markdown,
  Pressable,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { blockersOf, buildRoadmapLookup, dependentsOf } from "../roadmap-board";

export enum RoadmapItemDialogTestId {
  Root = "roadmap-item-dialog",
  Description = "roadmap-item-dialog-description",
  Attachments = "roadmap-item-dialog-attachments",
  Blockers = "roadmap-item-dialog-blockers",
  BlockerRow = "roadmap-item-dialog-blocker",
  Dependents = "roadmap-item-dialog-dependents",
  DependentRow = "roadmap-item-dialog-dependent",
  SyncNotes = "roadmap-item-dialog-sync-notes",
  Runs = "roadmap-item-dialog-runs",
  RunRow = "roadmap-item-dialog-run",
}

export interface RoadmapItemDialogProps {
  itemId: string;
  /** The whole project's items — resolves blockers/dependents/parent by id. */
  items: RoadmapItem[];
  onClose: () => void;
  /** Drill into another item (a blocker/dependent row was clicked). */
  onSelectItem: (itemId: string) => void;
}

const RUN_OUTCOME_TONE: Record<RoadmapRunOutcome, DotTone> = {
  running: "run",
  "awaiting-merge": "wait",
  done: "ok",
  failed: "bad",
};

/**
 * Read-only detail dialog (125d spec): the full markdown description
 * (`escapeHtml` — an imported issue body is untrusted third-party content, Law
 * 4), attachments, both dependency lists (an archived blocker marked distinctly,
 * same as the card's badge), `syncNotes` when present, and the run history with
 * PR links. Nothing here mutates the item — play/edit land in 125e/125f.
 */
export function RoadmapItemDialog({
  itemId,
  items,
  onClose,
  onSelectItem,
}: RoadmapItemDialogProps) {
  const t = useTranslations("roadmap");
  const tk = useTranslations();
  const locale = useLocale();
  const get = buildRoadmapLookup(items);
  const item = get(itemId);

  if (!item) return null;

  const blockers = blockersOf(item, get);
  const dependents = dependentsOf(item, items);

  const runOutcomeLabel: Record<RoadmapRunOutcome, string> = {
    running: t("dialog.runOutcome.running"),
    "awaiting-merge": t("dialog.runOutcome.awaiting-merge"),
    done: t("dialog.runOutcome.done"),
    failed: t("dialog.runOutcome.failed"),
  };

  function formatRunTime(run: RoadmapItemRun): string {
    const started = new Date(run.startedAt).toLocaleString(locale);
    if (!run.finishedAt) return started;
    return `${started} – ${new Date(run.finishedAt).toLocaleString(locale)}`;
  }

  return (
    <Dialog
      open
      actions={
        <Button intent="ghost" onClick={onClose}>
          {tk("common.close")}
        </Button>
      }
      ariaLabel={item.name}
      closeLabel={tk("common.close")}
      onClose={onClose}
      title={item.name}
      width="lg"
    >
      <Stack data-testid={RoadmapItemDialogTestId.Root} gap="250">
        <Stack data-testid={RoadmapItemDialogTestId.Description} gap="75">
          <Typography type="label">{t("dialog.description")}</Typography>
          <Markdown escapeHtml source={item.description} />
        </Stack>

        <Stack data-testid={RoadmapItemDialogTestId.Attachments} gap="75">
          <Typography type="label">{t("dialog.attachments")}</Typography>
          {item.attachments.length === 0 ? (
            <Typography size="sm" type="note" variant="tertiary">
              {t("dialog.noAttachments")}
            </Typography>
          ) : (
            <Stack gap="50">
              {item.attachments.map((file) => (
                <FilePreview
                  key={file.name}
                  mediaType={file.mediaType}
                  name={file.name}
                  size={file.size}
                />
              ))}
            </Stack>
          )}
        </Stack>

        <Stack data-testid={RoadmapItemDialogTestId.Blockers} gap="75">
          <Typography type="label">{t("dialog.blockers")}</Typography>
          {blockers.length === 0 ? (
            <Typography size="sm" type="note" variant="tertiary">
              {t("dialog.noBlockers")}
            </Typography>
          ) : (
            <Stack wrap direction="row" gap="75">
              {blockers.map((blocker) => (
                <Pressable
                  data-testid={RoadmapItemDialogTestId.BlockerRow}
                  key={blocker.id}
                  onClick={() => onSelectItem(blocker.id)}
                >
                  <Chip tone="wait">
                    <Icon aria-hidden name="pause" size="xs" />
                    {blocker.name}
                    {blocker.lifecycle === "archived" && ` — ${t("dialog.archivedNote")}`}
                  </Chip>
                </Pressable>
              ))}
            </Stack>
          )}
        </Stack>

        <Stack data-testid={RoadmapItemDialogTestId.Dependents} gap="75">
          <Typography type="label">{t("dialog.dependents")}</Typography>
          {dependents.length === 0 ? (
            <Typography size="sm" type="note" variant="tertiary">
              {t("dialog.noDependents")}
            </Typography>
          ) : (
            <Stack wrap direction="row" gap="75">
              {dependents.map((dependent) => (
                <Pressable
                  data-testid={RoadmapItemDialogTestId.DependentRow}
                  key={dependent.id}
                  onClick={() => onSelectItem(dependent.id)}
                >
                  <Chip tone="idle">
                    <Icon aria-hidden name="arrow" size="xs" />
                    {dependent.name}
                  </Chip>
                </Pressable>
              ))}
            </Stack>
          )}
        </Stack>

        {item.syncNotes.length > 0 && (
          <Stack data-testid={RoadmapItemDialogTestId.SyncNotes} gap="75">
            <Typography type="label">{t("dialog.syncNotes")}</Typography>
            <Stack gap="25">
              {item.syncNotes.map((note, i) => (
                <Typography key={i} size="sm" tone="warn" type="note">
                  {note}
                </Typography>
              ))}
            </Stack>
          </Stack>
        )}

        <Stack data-testid={RoadmapItemDialogTestId.Runs} gap="75">
          <Typography type="label">{t("dialog.runs")}</Typography>
          {item.runs.length === 0 ? (
            <Typography size="sm" type="note" variant="tertiary">
              {t("dialog.noRuns")}
            </Typography>
          ) : (
            <Stack gap="100">
              {item.runs.map((run, i) => (
                <Stack
                  align="center"
                  data-testid={RoadmapItemDialogTestId.RunRow}
                  direction="row"
                  gap="100"
                  justify="between"
                  key={`${run.taskId}-${i}`}
                >
                  <Stack gap="25">
                    <Chip dot tone={RUN_OUTCOME_TONE[run.outcome]}>
                      {runOutcomeLabel[run.outcome]}
                    </Chip>
                    <Typography size="xs" type="note" variant="tertiary">
                      {formatRunTime(run)}
                    </Typography>
                  </Stack>
                  {run.prUrl && run.prNumber ? (
                    <a href={run.prUrl} rel="noopener noreferrer" target="_blank">
                      <Typography size="sm" tone="accent" type="text">
                        {t("dialog.runPr", { number: run.prNumber })}
                      </Typography>
                    </a>
                  ) : run.artifactPath ? (
                    <Typography mono size="xs" type="note" variant="secondary">
                      {t("dialog.runArtifact", { path: run.artifactPath })}
                    </Typography>
                  ) : null}
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Dialog>
  );
}
