"use client";

import type { SubsystemWithStatus } from "@zibby/contracts";
import { Icon, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "../../../../components/EmptyState/EmptyState";
import { relativeTime } from "../../../../utils/time";
import { useRunGlyphMap, useRunsQuery } from "../../../runs";
import { ChainStepsPanel } from "../../../runs/components/ChainStepsPanel";
import { PipelineStageTimeline } from "../../../runs/components/PipelineStageTimeline";
import { TaskCard } from "../../../runs/components/TaskCard";
import { type RunView, runGlyph } from "../../../runs/run";
import { runSubsystemId, useOwnerSubsystemMaps } from "../../useOwnerSubsystem";

export enum AktivitaTabTestId {
  Root = "aktivita-tab-root",
  AllRunsLink = "aktivita-tab-all-runs-link",
  List = "aktivita-tab-list",
  Row = "aktivita-tab-row",
  Expanded = "aktivita-tab-expanded",
}

export interface AktivitaTabProps {
  subsystem: SubsystemWithStatus;
}

/** Cap the drawer's list — the full, unbounded history lives on `/archiv` (F8d —
 * `/runs` is deleted; design doc: "recent runs … + 'Všechny runy' link to /runs,
 * the global page remains the full view"). */
const MAX_RUNS = 20;

/**
 * Statuses whose row expands INLINE (a live or failed run — worth a second look
 * right here, per the phase-86 plan). Every other status (done, and every
 * waiting/scheduled/parked/held/queued/paused-limit/interrupted state) instead
 * links straight to the full run detail page, which already has everything
 * (output, PR link, full stage/step history).
 */
const EXPANDABLE_STATUSES = new Set<RunView["status"]>(["running", "error"]);

/**
 * Recent runs scoped to THIS subsystem's owned pipelines/chains (Phase 86,
 * design doc "Aktivita — recent runs, live log. Reuses today's Runs & Activity
 * page behavior, scoped to this subsystem").
 *
 * Scoped runs endpoint OR client filter (phase-86 plan §1): chose the CLIENT
 * FILTER, not a new `ownerSubsystem` query param on the unified runs endpoint —
 * the unified feed (`useRunsQuery`) already returns `kind`/`owner` per row, and
 * `RosterTab` (phase 85) already fetches the full pipeline/chain catalogs
 * (`ownerSubsystem` included) for the SAME drawer. Filtering those already-
 * fetched, already-cached lists client-side — exactly `RosterTab`'s own
 * `pipelines.filter((p) => p.ownerSubsystem === subsystem.id)` pattern — costs
 * zero new endpoints, zero contract changes, and zero new API tests, for a
 * ~20-row cap in one drawer tab. A server-side filter would only earn its keep
 * once the unified feed itself gets too large to fetch in full, which it isn't.
 *
 * RECON CORRECTION on the plan's literal "expanding … shows the live log tail
 * via RunLogStream" — ownership only ever attributes through a pipeline or
 * chain (see `SubsystemsService.aggregateAll`, mirrored by the filter below),
 * so every run in scope here is `kind: "pipeline"` or `kind: "chain"`, never
 * `"agent"`. Both those kinds carry `logBase: null` (only an agent run has a
 * single unified log — see `TaskRunSchema`'s doc comment), and
 * `TaskRunsService.getLogs` actively throws `TaskRunNotFoundError` for any
 * other kind. Pointing `RunLogStream` at a pipeline/chain runId would silently
 * poll a permanently-404ing endpoint forever, not show "the live log tail". The
 * inline expand instead reuses the SAME per-kind live views `RunDetail` already
 * renders for these two kinds — `PipelineStageTimeline` (pipeline) /
 * `ChainStepsPanel` (chain), themselves built on the existing SSE-preferring
 * stage-log stream — so this is still "no new transport, no fork", just the
 * existing transport that actually matches the kinds in scope.
 *
 * Query hooks mount only while this component itself is mounted — the `TabPanel`
 * hosting it (`SubsystemDrawer.tsx`) unmounts its children whenever another tab
 * is active (`Tabs.tsx`: `if (active !== value) return null`), so a closed
 * drawer, or the drawer open on a different tab, polls nothing here.
 */
export function AktivitaTab({ subsystem }: AktivitaTabProps) {
  const t = useTranslations("subsystems.aktivita");
  const tRuns = useTranslations("runs");
  const router = useRouter();

  const { runs } = useRunsQuery();
  const glyphById = useRunGlyphMap();
  const ownerMaps = useOwnerSubsystemMaps();
  // Render-stable "now" for the coarse relative "started" label (Date.now() in
  // render is impure — mirrors the runs Screen's own `now` state).
  const [now] = useState(() => Date.now());
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // `runs` is already newest-first (the unified feed's own order — see
  // `useRunsQuery`'s header comment); only filtering + capping happens here.
  // The join itself (F2) now lives in `useOwnerSubsystemMaps`/`runSubsystemId`,
  // shared with the `/archiv` page's subsystem grouping.
  const scoped = runs
    .filter((r) => runSubsystemId(r, ownerMaps) === subsystem.id)
    .slice(0, MAX_RUNS);

  const ago = (n: number, unit: string) =>
    n === 0 ? tRuns("agoNow") : unit === "m" ? tRuns("agoM", { n }) : tRuns("agoH", { n });

  function handleSelect(run: RunView) {
    if (EXPANDABLE_STATUSES.has(run.status)) {
      setExpandedRunId((cur) => (cur === run.runId ? null : run.runId));
      return;
    }
    router.push(`/archiv?run=${run.runId}` as Route);
  }

  return (
    <Stack data-testid={AktivitaTabTestId.Root} gap="150">
      <Stack align="center" direction="row" justify="end">
        <Link data-testid={AktivitaTabTestId.AllRunsLink} href={"/archiv" as Route}>
          <Stack align="center" direction="row" gap="50">
            <Typography mono size="xs" tone="accent" type="note">
              {t("allRuns")}
            </Typography>
            <Icon name="arrow" size="xs" tone="accent" />
          </Stack>
        </Link>
      </Stack>

      {scoped.length === 0 ? (
        <EmptyState description={t("emptyDescription")} glyph="pulse" title={t("emptyTitle")} />
      ) : (
        <Stack data-testid={AktivitaTabTestId.List} gap="150">
          {scoped.map((run) => {
            const expanded = expandedRunId === run.runId && EXPANDABLE_STATUSES.has(run.status);
            return (
              <Stack data-testid={AktivitaTabTestId.Row} gap="100" key={run.runId}>
                <TaskCard
                  glyph={runGlyph(run, glyphById)}
                  now={now}
                  onSelect={() => handleSelect(run)}
                  run={run}
                  selected={expanded}
                  startedLabel={relativeTime(run.startedAt, now, ago)}
                  stateLabel={tRuns(`state.${run.status}`)}
                />
                {expanded &&
                  (run.kind === "chain" ? (
                    <div data-testid={AktivitaTabTestId.Expanded}>
                      <ChainStepsPanel run={run} />
                    </div>
                  ) : (
                    <div data-testid={AktivitaTabTestId.Expanded}>
                      <PipelineStageTimeline
                        currentStage={run.currentStage}
                        live={run.status === "running"}
                        owner={run.owner}
                        parked={run.parked}
                        pipelineRunId={run.runId}
                        stageRuns={run.stageRuns}
                      />
                    </div>
                  ))}
              </Stack>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
