"use client";

import { SUBSYSTEMS } from "@zibby/contracts";
import { ButtonGroup, Container, SearchInput, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { ImmersivePage } from "../../components/layout/ImmersivePage/ImmersivePage";
import { formatDuration } from "../../utils/time";
import { isArchived } from "../runs/archiveStatus";
import { RunDetail } from "../runs/components/RunDetail";
import { useRunAvatarMap, useRunGlyphMap, useRunsQuery } from "../runs/queries/useRunsQuery";
import { type RunView, findSelectedRun, runAvatar, runGlyph } from "../runs/run";
import { useRunActions } from "../runs/useRunActions";
import { useOwnerSubsystemMaps } from "../subsystems/useOwnerSubsystem";
import {
  type ArchiveGroupMode,
  type ArchiveSubsystemFilterId,
  NO_SUBSYSTEM,
  type TimeBucket,
  archiveSubsystemFilterId,
  computeSubsystemCounts,
  filterArchiveRuns,
  groupArchiveRuns,
} from "./archiveGroups";
import { ArchiveRow } from "./components/ArchiveRow";
import { ArchiveSubsystemFilter } from "./components/ArchiveSubsystemFilter";

/** A group's display name + dot colour — resolved here (not in the pure
 * `archiveGroups` module) since it needs both `t()` and the `SUBSYSTEMS`
 * registry. Shared by the rail's group headers and every row's subline, which
 * always shows `{subsystem} · {project}` regardless of the active grouping
 * mode (design: `ArRow`). */
function subsystemDisplay(
  id: ArchiveSubsystemFilterId,
  t: ReturnType<typeof useTranslations<"archive">>,
): { name: string; color?: string } {
  if (id === NO_SUBSYSTEM) return { name: t("noSubsystem") };
  const s = SUBSYSTEMS.find((x) => x.id === id);
  return { name: s?.name ?? id, color: s?.color };
}

/** Total wall-clock duration for a finished run, formatted mono — `""` when
 * the task never wrote back a finish time (nothing to show, not a guess). */
function durationLabel(run: RunView): string {
  if (!run.taskOutcomeFinishedAt) return "";
  return formatDuration(Date.parse(run.taskOutcomeFinishedAt) - Date.parse(run.startedAt));
}

/**
 * `/archiv` — the task archive (F2, `docs/plans/hud2chat-F2-archive.md`): every
 * finished task (D9's `ARCHIVED_STATES`) across every subsystem, in one
 * design-literal master/detail page (`design/Z.I.B.B.Y/ZIBBY Archiv úloh.html`).
 *
 * Reuses, never refetches: `useRunsQuery()` is the SAME unified feed `ChatTasksPanel`
 * and the runs `Screen` read; the archive split (`isArchived`), the subsystem join
 * (`useOwnerSubsystemMaps`/`archiveSubsystemFilterId`), `RunDetail`, `useRunActions`,
 * and `findSelectedRun` are all shared modules/components, not copies.
 *
 * D12: `ImmersiveShell`'s body has no padding, and this page deliberately keeps it
 * that way — a master/detail split should touch the viewport edges — so padding is
 * supplied per-pane below instead of on the page root.
 */
/** Translated label per {@link TimeBucket} — built from literal `t()` calls, not
 * a dynamic template key: `ArchiveGroup.id` is plain `string`, and next-intl's
 * typed `Messages` (see `apps/web/global.d.ts`) rejects an open `` `time.${string}` ``
 * template against its literal-key union, so the lookup has to be a static
 * record instead of `t(\`time.${id}\`)`. */
function timeBucketLabels(
  t: ReturnType<typeof useTranslations<"archive">>,
): Record<TimeBucket, string> {
  return {
    today: t("time.today"),
    yesterday: t("time.yesterday"),
    week: t("time.week"),
    older: t("time.older"),
  };
}

export function Screen() {
  const t = useTranslations("archive");
  const {
    runs: allRuns,
    isPending: runsPending,
    isError: runsError,
    refetch: refetchRuns,
  } = useRunsQuery();
  const glyphById = useRunGlyphMap();
  const avatarById = useRunAvatarMap();
  const ownerMaps = useOwnerSubsystemMaps();
  const [now] = useState(() => Date.now());

  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [groupMode, setGroupMode] = useState<ArchiveGroupMode>("subsystem");
  const [subsystemFilter, setSubsystemFilter] = useState<ArchiveSubsystemFilterId[]>([]);
  const [selId, setSelId] = useState<string | null>(searchParams.get("run"));

  const { stop, stopping, resume, resuming, remove, deleting } = useRunActions(
    (runId) => setSelId(runId),
    () => setSelId(null),
  );

  const archivedTotal = allRuns.filter((r) => isArchived(r.status)).length;
  const filtered = filterArchiveRuns(allRuns, query, subsystemFilter, ownerMaps);
  const counts = computeSubsystemCounts(allRuns, query, ownerMaps);
  const groups = groupArchiveRuns(groupMode, filtered, ownerMaps, now);
  const selected = findSelectedRun(filtered, selId);
  const timeLabels = timeBucketLabels(t);

  if (runsPending) {
    return (
      <ImmersivePage subtitle={t("subtitle")} title={t("title")}>
        <QueryLoading />
      </ImmersivePage>
    );
  }

  if (runsError) {
    return (
      <ImmersivePage subtitle={t("subtitle")} title={t("title")}>
        <QueryError onRetry={() => void refetchRuns()} />
      </ImmersivePage>
    );
  }

  return (
    <ImmersivePage subtitle={t("subtitle")} title={t("title")}>
      <Stack direction="row" style={{ height: "100%" }}>
        <Container
          height="100%"
          overflowY="auto"
          shrink={false}
          style={{ borderRight: "1px solid var(--color-border)" }}
          width="340px"
        >
          <Container padding="150" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <Stack gap="100">
              <SearchInput
                ariaLabel={t("searchAriaLabel")}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                value={query}
              />
              <ArchiveSubsystemFilter
                counts={counts}
                onChange={setSubsystemFilter}
                selected={subsystemFilter}
                total={archivedTotal}
              />
              <ButtonGroup
                ariaLabel={t("title")}
                onChange={(id) => setGroupMode(id === "time" ? "time" : "subsystem")}
                options={[
                  { id: "subsystem", label: t("group.subsystem") },
                  { id: "time", label: t("group.time") },
                ]}
                value={groupMode}
              />
            </Stack>
          </Container>

          <Container padding="150">
            {archivedTotal === 0 ? (
              <Stack gap="75">
                <Typography size="xs" type="note" variant="tertiary">
                  {t("emptyTitle")}
                </Typography>
                <Typography size="2xs" type="note" variant="tertiary">
                  {t("emptyDescription")}
                </Typography>
              </Stack>
            ) : groups.length === 0 ? (
              <Typography mono size="xs" type="note" variant="tertiary">
                {t("emptyFilter")}
              </Typography>
            ) : (
              <Stack gap="200">
                {groups.map((group) => {
                  const heading =
                    groupMode === "subsystem"
                      ? subsystemDisplay(group.id as ArchiveSubsystemFilterId, t).name
                      : timeLabels[group.id as TimeBucket];
                  return (
                    <Stack gap="75" key={group.id}>
                      <Typography
                        mono
                        uppercase
                        size="2xs"
                        tracking="wide"
                        type="note"
                        variant="tertiary"
                      >
                        {heading} · {group.items.length}
                      </Typography>
                      <Stack gap="50">
                        {group.items.map((run) => {
                          const subsystemId = archiveSubsystemFilterId(run, ownerMaps);
                          const display = subsystemDisplay(subsystemId, t);
                          return (
                            <ArchiveRow
                              active={selected?.runId === run.runId}
                              durationLabel={durationLabel(run)}
                              key={run.runId}
                              onSelect={setSelId}
                              run={run}
                              subsystemColor={display.color}
                              subsystemName={display.name}
                            />
                          );
                        })}
                      </Stack>
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </Container>
        </Container>

        <Container grow height="100%" overflowY="auto">
          {selected ? (
            <Container padding="300">
              <RunDetail
                avatar={runAvatar(selected, avatarById)}
                deleting={deleting}
                glyph={runGlyph(selected, glyphById)}
                key={selected.runId}
                now={now}
                onDelete={() => remove(selected.runId, selected.kind)}
                onResume={() => resume(selected)}
                onStop={() => stop(selected)}
                resuming={resuming}
                run={selected}
                stopping={stopping}
              />
            </Container>
          ) : (
            <HudPanel padding="500">
              <Container textAlign="center">
                <Typography mono size="sm" type="note" variant="secondary">
                  {t("selectHint")}
                </Typography>
              </Container>
            </HudPanel>
          )}
        </Container>
      </Stack>
    </ImmersivePage>
  );
}
