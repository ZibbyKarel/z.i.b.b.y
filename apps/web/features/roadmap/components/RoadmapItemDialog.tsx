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
  SelectField,
  Stack,
  Tag,
  Tooltip,
  Typography,
} from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useUpdateRoadmapItemMutation } from "../mutations";
import { blockersOf, buildRoadmapLookup, dependentsOf } from "../roadmap-board";

export enum RoadmapItemDialogTestId {
  Root = "roadmap-item-dialog",
  Description = "roadmap-item-dialog-description",
  Attachments = "roadmap-item-dialog-attachments",
  Blockers = "roadmap-item-dialog-blockers",
  BlockerRow = "roadmap-item-dialog-blocker",
  RemoveDependency = "roadmap-item-dialog-remove-dependency",
  SourceOwnedBadge = "roadmap-item-dialog-source-owned-badge",
  AddDependency = "roadmap-item-dialog-add-dependency",
  Dependents = "roadmap-item-dialog-dependents",
  DependentRow = "roadmap-item-dialog-dependent",
  SyncNotes = "roadmap-item-dialog-sync-notes",
  FailureReason = "roadmap-item-dialog-failure-reason",
  Runs = "roadmap-item-dialog-runs",
  RunRow = "roadmap-item-dialog-run",
}

/** Sentinel for the "add dependency" picker — reset to this right after firing
 * the mutation, so the trigger always shows the placeholder rather than
 * "remembering" the last pick (there is nothing to remember: the pick becomes
 * a chip in the list above, not a persistent selection in this control). */
const NO_SELECTION = "";

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
 * The full markdown description (`escapeHtml` — an imported issue body is
 * untrusted third-party content, Law 4), attachments, `syncNotes` when
 * present, and the run history with PR links are read-only (125d). Dependency
 * editing (125f) lives on the "Čeká na" (blockers) list: an operator-owned
 * edge (not in `dependsOnFromSource`) gets a remove button; a SOURCE-owned
 * edge is excluded from removal entirely and marked with a "zdroj" badge
 * instead — a re-sync may rewrite `dependsOnFromSource` at any time, so the
 * operator must never be able to silently drop one of those edges here (see
 * the ownership split on `RoadmapItemSchema`). Adding a new dependency always
 * PATCHes the WHOLE `dependsOn` array (`dependsOnFromSource` unchanged +
 * the edited operator-owned subset), never a partial list. The "Blokuje"
 * (dependents) list stays read-only here — editing it means opening the
 * OTHER item's own dialog.
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
  // Called unconditionally (before the `!item` early return) so the hook order
  // never depends on whether `itemId` currently resolves — `item?.projectId`
  // falls back to `""` in that (never-rendered) case.
  const updateMut = useUpdateRoadmapItemMutation(item?.projectId ?? "");
  const [addPick, setAddPick] = useState(NO_SELECTION);

  if (!item) return null;

  const blockers = blockersOf(item, get);
  const dependents = dependentsOf(item, items);
  // Every other project item not already depended on — self and existing
  // edges (source- or operator-owned alike) are excluded, so the picker can
  // never offer a self-dependency or a duplicate edge.
  const addableOptions = items
    .filter((candidate) => candidate.id !== item.id && !item.dependsOn.includes(candidate.id))
    .map((candidate) => ({ value: candidate.id, label: candidate.name }));

  function addDependency(id: string) {
    if (!item || id === NO_SELECTION) return;
    setAddPick(NO_SELECTION);
    updateMut.mutate({
      params: { projectId: item.projectId, itemId: item.id },
      body: { dependsOn: [...item.dependsOn, id] },
    });
  }

  function removeDependency(id: string) {
    if (!item) return;
    updateMut.mutate({
      params: { projectId: item.projectId, itemId: item.id },
      body: { dependsOn: item.dependsOn.filter((depId) => depId !== id) },
    });
  }

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
            <Stack wrap align="center" direction="row" gap="75">
              {blockers.map((blocker) => {
                const sourceOwned = item.dependsOnFromSource.includes(blocker.id);
                return (
                  <Stack align="center" direction="row" gap="50" key={blocker.id}>
                    <Pressable
                      data-testid={RoadmapItemDialogTestId.BlockerRow}
                      onClick={() => onSelectItem(blocker.id)}
                    >
                      <Chip tone="wait">
                        <Icon aria-hidden name="pause" size="xs" />
                        {blocker.name}
                        {blocker.lifecycle === "archived" && ` — ${t("dialog.archivedNote")}`}
                      </Chip>
                    </Pressable>
                    {sourceOwned ? (
                      <Tooltip content={t("dialog.dependencySourceOwnedHint")}>
                        <Tag data-testid={RoadmapItemDialogTestId.SourceOwnedBadge} size="sm">
                          {t("dialog.dependencySourceOwned")}
                        </Tag>
                      </Tooltip>
                    ) : (
                      <Button
                        aria-label={t("dialog.removeDependency", { name: blocker.name })}
                        data-testid={`${RoadmapItemDialogTestId.RemoveDependency}-${blocker.id}`}
                        icon="x"
                        intent="ghost"
                        onClick={() => removeDependency(blocker.id)}
                        size="sm"
                      />
                    )}
                  </Stack>
                );
              })}
            </Stack>
          )}
          {addableOptions.length > 0 && (
            <Stack data-testid={RoadmapItemDialogTestId.AddDependency}>
              <SelectField
                label={t("dialog.addDependencyLabel")}
                onValueChange={addDependency}
                options={[
                  { value: NO_SELECTION, label: t("dialog.addDependencyPlaceholder") },
                  ...addableOptions,
                ]}
                value={addPick}
              />
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

        {item.lifecycle === "failed" && item.lastFailureReason && (
          <Stack data-testid={RoadmapItemDialogTestId.FailureReason} gap="75">
            <Typography type="label">{t("dialog.failureReason")}</Typography>
            <Typography size="sm" tone="bad" type="note">
              {item.lastFailureReason}
            </Typography>
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
