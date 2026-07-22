"use client";

import type { ArtifactKind, ArtifactRecord, SubsystemWithStatus } from "@zibby/contracts";
import { Divider, Icon, type IconName, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "../../../../components/EmptyState/EmptyState";
import { HudPanel } from "../../../../components/HudPanel/HudPanel";
import type { PipelineOutput } from "../../../../domain";
import { relativeTime } from "../../../../utils/time";
import { useArtifactsQuery } from "../../../artifacts";
import { usePipelinesQuery } from "../../../pipelines";

export enum ArtefaktyTabTestId {
  Root = "artefakty-tab-root",
  CombinedEmpty = "artefakty-tab-combined-empty",
  Produce = "artefakty-tab-produce",
  ProduceRow = "artefakty-tab-produce-row",
  ProduceEmpty = "artefakty-tab-produce-empty",
  History = "artefakty-tab-history",
  HistoryRow = "artefakty-tab-history-row",
  HistoryEmpty = "artefakty-tab-history-empty",
  ArtifactLink = "artefakty-tab-artifact-link",
  RunLink = "artefakty-tab-run-link",
}

export interface ArtefaktyTabProps {
  subsystem: SubsystemWithStatus;
}

/** Cap the history list — same "recent slice, /runs or the registry owns the full
 * history" posture as `AktivitaTab`'s `MAX_RUNS`. */
const MAX_ARTIFACTS = 20;

const SINK_GLYPH: Record<PipelineOutput["type"], IconName> = { pr: "branch", file: "file" };
const ARTIFACT_KIND_GLYPH: Record<ArtifactKind, IconName> = {
  pr: "branch",
  "vault-note": "brain",
  "project-file": "file",
};

/** The `subsystems.artefakty` i18n key naming one output sink's static promise
 * label ("PR na review" / "soubor → projekt" / "poznámka → vault") — a literal
 * return type (not a translated string) so a component's own namespaced `t`
 * can call it directly without threading a translator function through props
 * (next-intl's `Translator` type is keyed to its exact namespace, so it can't
 * be typed as a plain `(key: string) => string` prop — see `ProduceRow`/
 * `HistoryRow` below, which call `useTranslations` themselves instead, the
 * same posture `GatesTab`'s `GateRuleSentenceRow` already takes). */
function sinkKey(output: PipelineOutput): "sinkPr" | "sinkFileProject" | "sinkFileVault" {
  if (output.type === "pr") return "sinkPr";
  return output.dest === "vault" ? "sinkFileVault" : "sinkFileProject";
}

interface ProduceRowProps {
  pipelineName: string;
  output: PipelineOutput;
  /** The receiving subsystem's display name, or `undefined` for "→ operátor". */
  consumerName: string | undefined;
}

function ProduceRow({ pipelineName, output, consumerName }: ProduceRowProps) {
  const t = useTranslations("subsystems.artefakty");
  return (
    <div data-testid={ArtefaktyTabTestId.ProduceRow}>
      <Stack wrap align="center" direction="row" gap="75">
        <Icon name={SINK_GLYPH[output.type]} size="xs" tone="faint" />
        <Typography size="sm" type="text" weight="semibold">
          {pipelineName}
        </Typography>
        <Typography size="sm" type="note" variant="secondary">
          {t(sinkKey(output))}
        </Typography>
        <Icon name="arrow" size="xs" tone="faint" />
        <Typography mono size="xs" type="note" variant="tertiary">
          {consumerName ? t("handsOffTo", { name: consumerName }) : t("toOperator")}
        </Typography>
      </Stack>
    </div>
  );
}

interface HistoryRowProps {
  artifact: ArtifactRecord;
  now: number;
  ago: (n: number, unit: string) => string;
}

/**
 * One delivered artifact: kind glyph + label, then the name (the handoff
 * `from` the sink drew from) — opened externally for a `pr` (its `locator` is
 * the PR URL, `rel="noreferrer"` per the `PrOutputCard`/`ProjectPullRequestsPanel`
 * idiom), linked to the memory page for a `vault-note` (that surface has no
 * per-note route yet — see the header comment — so this links the page, not
 * the specific note), plain text for a `project-file` (no file-browsing
 * surface exists yet, N5 machine-ops territory, still gated). Then the
 * producing run link and a relative timestamp.
 */
function HistoryRow({ artifact, now, ago }: HistoryRowProps) {
  const t = useTranslations("subsystems.artefakty");
  const name = artifact.from;
  return (
    <div data-testid={ArtefaktyTabTestId.HistoryRow}>
      <Stack wrap align="center" direction="row" gap="100" justify="between">
        <Stack align="center" direction="row" gap="75">
          <Icon name={ARTIFACT_KIND_GLYPH[artifact.kind]} size="xs" tone="faint" />
          <Typography mono size="2xs" type="note" variant="tertiary">
            {t(`kind.${artifact.kind}`)}
          </Typography>
          {artifact.kind === "pr" ? (
            <a
              data-testid={ArtefaktyTabTestId.ArtifactLink}
              href={artifact.locator}
              rel="noreferrer"
              target="_blank"
            >
              <Typography size="sm" type="text">
                {name}
              </Typography>
            </a>
          ) : artifact.kind === "vault-note" ? (
            <Link data-testid={ArtefaktyTabTestId.ArtifactLink} href={"/memory" as Route}>
              <Typography size="sm" type="text">
                {name}
              </Typography>
            </Link>
          ) : (
            <Typography mono size="sm" type="text">
              {name}
            </Typography>
          )}
        </Stack>
        <Stack align="center" direction="row" gap="100">
          <Link
            data-testid={ArtefaktyTabTestId.RunLink}
            href={`/archiv?run=${artifact.producedBy.runRef}` as Route}
          >
            <Typography mono size="2xs" tone="accent" type="note">
              {t("runLink")}
            </Typography>
          </Link>
          <Typography mono size="2xs" type="note" variant="tertiary">
            {relativeTime(artifact.createdAt, now, ago)}
          </Typography>
        </Stack>
      </Stack>
    </div>
  );
}

/**
 * Artefakty tab (Phase 88, design doc "what this subsystem produces and who it
 * hands off to"). Two derived-only sections, no new artifact-ownership store:
 *
 * - **Produkuje**: the owned pipelines' `outputs[]` — one line per sink, its
 *   static delivery type, and a derived receiver (`consumerSubsystemName` above).
 * - **Vyrobené artefakty**: the N2a artifact registry (`useArtifactsQuery`,
 *   unfiltered — its own `pipelineId` query filter only takes one id, so a
 *   multi-pipeline subsystem filters client-side, the same posture
 *   `AktivitaTab` (Phase 86) already took for the unified runs feed), scoped
 *   to `producedBy.pipelineId` in this subsystem's owned set and capped to
 *   `MAX_ARTIFACTS`.
 *
 * An owner-less subsystem (no pipeline at all) collapses BOTH sections into
 * ONE combined empty state — there is nothing to produce and nothing that
 * could have been delivered, so two separate empty panels would just repeat
 * the same fact. A subsystem WITH pipelines but none configuring `outputs`
 * gets a lighter, single-line honest note in the Produkuje panel instead (the
 * `GatesTab` autopilot-summary posture: a plain sentence, not a second empty
 * card) — this is a "not configured" state, not an "empty catalog" one.
 */
export function ArtefaktyTab({ subsystem }: ArtefaktyTabProps) {
  const t = useTranslations("subsystems.artefakty");
  const tRuns = useTranslations("runs");
  const [now] = useState(() => Date.now());

  const { data: pipelines = [] } = usePipelinesQuery();
  const { data: artifacts = [] } = useArtifactsQuery();

  const ownedPipelines = pipelines.filter((p) => p.ownerSubsystem === subsystem.id);

  if (ownedPipelines.length === 0) {
    return (
      <div data-testid={ArtefaktyTabTestId.Root}>
        <div data-testid={ArtefaktyTabTestId.CombinedEmpty}>
          <EmptyState description={t("emptyDescription")} glyph="flow" title={t("emptyTitle")} />
        </div>
      </div>
    );
  }

  // A pipeline's consumer is no longer derivable (it used to come from N2b
  // chain wiring) — the honest "→ operátor" default is always rendered until
  // a non-chain consumer-derivation mechanism exists.
  const produceRows = ownedPipelines.flatMap((pipeline) =>
    pipeline.outputs.map((output) => ({
      key: `${pipeline.id}:${output.type}:${output.from}`,
      pipelineName: pipeline.name,
      output,
      consumerName: undefined as string | undefined,
    })),
  );

  const ownedPipelineIds = new Set(ownedPipelines.map((p) => p.id));
  const scopedArtifacts = artifacts
    .filter((a) => ownedPipelineIds.has(a.producedBy.pipelineId))
    .slice(0, MAX_ARTIFACTS);

  const ago = (n: number, unit: string) =>
    n === 0 ? tRuns("agoNow") : unit === "m" ? tRuns("agoM", { n }) : tRuns("agoH", { n });

  return (
    <Stack data-testid={ArtefaktyTabTestId.Root} gap="200">
      <div data-testid={ArtefaktyTabTestId.Produce}>
        <HudPanel title={t("produceTitle")}>
          {produceRows.length === 0 ? (
            <div data-testid={ArtefaktyTabTestId.ProduceEmpty}>
              <Typography size="xs" type="note" variant="tertiary">
                {t("produceEmpty")}
              </Typography>
            </div>
          ) : (
            <Stack gap="100">
              {produceRows.map((row) => (
                <ProduceRow
                  consumerName={row.consumerName}
                  key={row.key}
                  output={row.output}
                  pipelineName={row.pipelineName}
                />
              ))}
            </Stack>
          )}
        </HudPanel>
      </div>

      <Divider />

      <div data-testid={ArtefaktyTabTestId.History}>
        <HudPanel title={t("historyTitle")}>
          {scopedArtifacts.length === 0 ? (
            <div data-testid={ArtefaktyTabTestId.HistoryEmpty}>
              <EmptyState
                description={t("historyEmptyDescription")}
                glyph="file"
                title={t("historyEmptyTitle")}
              />
            </div>
          ) : (
            <Stack gap="150">
              {scopedArtifacts.map((artifact) => (
                <HistoryRow ago={ago} artifact={artifact} key={artifact.id} now={now} />
              ))}
            </Stack>
          )}
        </HudPanel>
      </div>
    </Stack>
  );
}
