"use client";

import { Panel, SegmentedControl, Stack, Typography } from "@zibby/design-system";
import type { EffectiveRoadmapConfig } from "@zibby/contracts";
import { useTranslations } from "next-intl";
import { QueryError } from "../../../components/LoadError/QueryError";
import { useSetRoadmapConfigMutation } from "../mutations";
import { useRoadmapConfigQuery } from "../queries";

export enum RoadmapAutomationPanelTestId {
  Root = "roadmap-automation-panel",
  AutoSync = "roadmap-automation-auto-sync",
  AutoPlay = "roadmap-automation-auto-play",
  AutoReview = "roadmap-automation-auto-review",
  AutoAddressComments = "roadmap-automation-auto-address-comments",
  AutoSyncEffective = "roadmap-automation-auto-sync-effective",
  AutoPlayEffective = "roadmap-automation-auto-play-effective",
  AutoReviewEffective = "roadmap-automation-auto-review-effective",
  AutoAddressCommentsEffective = "roadmap-automation-auto-address-comments-effective",
}

export interface RoadmapAutomationPanelProps {
  projectId: string;
  /** The project's company, named in "inherited from company X" (omitted = no company). */
  companyName?: string | undefined;
}

type TriState = "inherit" | "on" | "off";
type ToggleKey = "autoSync" | "autoPlay" | "autoReview" | "autoAddressComments";

const toTriState = (value: boolean | null | undefined): TriState =>
  value === true ? "on" : value === false ? "off" : "inherit";
/** `inherit` maps to `null` — the contract's explicit "reset to inherit". */
const fromTriState = (value: string): boolean | null =>
  value === "on" ? true : value === "off" ? false : null;

interface TriStateFieldProps {
  toggle: ToggleKey;
  testId: RoadmapAutomationPanelTestId;
  effectiveTestId: RoadmapAutomationPanelTestId;
  value: boolean | null | undefined;
  effective: EffectiveRoadmapConfig | undefined;
  companyName: string | undefined;
  disabled: boolean;
  onChange: (value: boolean | null) => void;
}

/**
 * Inherit / On / Off for one toggle (DS `SegmentedControl` — mutually exclusive
 * options, which a binary `Switch` cannot express), plus the value that actually
 * applies and where it comes from.
 */
function TriStateField({
  toggle,
  testId,
  effectiveTestId,
  value,
  effective,
  companyName,
  disabled,
  onChange,
}: TriStateFieldProps) {
  const t = useTranslations("roadmap.automation");
  const source = effective?.source[toggle];
  const sourceLabel =
    source === "company"
      ? t("source.company", { name: companyName ?? "" })
      : source === "global"
        ? t("source.global")
        : t("source.project");

  return (
    <Stack gap="75">
      <Typography type="label">{t(toggle)}</Typography>
      <Typography size="xs" type="note" variant="tertiary">
        {t(`${toggle}Hint`)}
      </Typography>
      <Stack data-testid={testId}>
        <SegmentedControl
          ariaLabel={t(toggle)}
          items={[
            { value: "inherit", label: t("state.inherit") },
            { value: "on", label: t("state.on") },
            { value: "off", label: t("state.off") },
          ]}
          // The DS control has no `disabled`; a write in flight just swallows the click.
          onChange={(next) => !disabled && onChange(fromTriState(next))}
          size="sm"
          value={toTriState(value)}
        />
      </Stack>
      {effective && (
        <Typography data-testid={effectiveTestId} size="xs" type="note" variant="secondary">
          {t("effective", {
            state: effective[toggle] ? t("state.on") : t("state.off"),
            source: sourceLabel,
          })}
        </Typography>
      )}
    </Stack>
  );
}

/**
 * The two per-project roadmap automation toggles, on the project's Integrations
 * tab rather than the roadmap tab itself: they answer "what may ZIBBY do on its
 * own with this project's issue sources", which is the same question the
 * channels above them answer — and unlike the Sync button, neither shows its
 * result on the board, so neither earns a place in the board's header.
 *
 * Each toggle is tri-state (Phase 128, D8): Inherit (the company default, else
 * the global default), or an explicit On / Off for this project. Saving Inherit
 * sends `null`. Choices apply immediately (no Save button), and each PATCHes only
 * its own field — the route merges, so flipping one can never reset the other.
 */
export function RoadmapAutomationPanel({ projectId, companyName }: RoadmapAutomationPanelProps) {
  const t = useTranslations("roadmap.automation");
  const configQuery = useRoadmapConfigQuery(projectId);
  const setConfig = useSetRoadmapConfigMutation(projectId);

  const config = configQuery.data;
  // A toggle mid-flight must not invite a second click; a config still loading
  // has no honest state to show, so it reads as locked rather than flickering.
  const busy = configQuery.isPending || setConfig.isPending;

  return (
    <Panel header={t("title")} padding="200">
      {configQuery.isError ? (
        <QueryError onRetry={() => void configQuery.refetch()} />
      ) : (
        <Stack data-testid={RoadmapAutomationPanelTestId.Root} gap="200">
          <Typography size="xs" type="note" variant="tertiary">
            {t("hint")}
          </Typography>
          <TriStateField
            companyName={companyName}
            disabled={busy}
            effective={config?.effective}
            effectiveTestId={RoadmapAutomationPanelTestId.AutoSyncEffective}
            onChange={(autoSync) => setConfig.mutate({ params: { projectId }, body: { autoSync } })}
            testId={RoadmapAutomationPanelTestId.AutoSync}
            toggle="autoSync"
            value={config?.autoSync}
          />
          <TriStateField
            companyName={companyName}
            disabled={busy}
            effective={config?.effective}
            effectiveTestId={RoadmapAutomationPanelTestId.AutoPlayEffective}
            onChange={(autoPlay) => setConfig.mutate({ params: { projectId }, body: { autoPlay } })}
            testId={RoadmapAutomationPanelTestId.AutoPlay}
            toggle="autoPlay"
            value={config?.autoPlay}
          />
          <TriStateField
            companyName={companyName}
            disabled={busy}
            effective={config?.effective}
            effectiveTestId={RoadmapAutomationPanelTestId.AutoReviewEffective}
            onChange={(autoReview) =>
              setConfig.mutate({ params: { projectId }, body: { autoReview } })
            }
            testId={RoadmapAutomationPanelTestId.AutoReview}
            toggle="autoReview"
            value={config?.autoReview}
          />
          <TriStateField
            companyName={companyName}
            disabled={busy}
            effective={config?.effective}
            effectiveTestId={RoadmapAutomationPanelTestId.AutoAddressCommentsEffective}
            onChange={(autoAddressComments) =>
              setConfig.mutate({ params: { projectId }, body: { autoAddressComments } })
            }
            testId={RoadmapAutomationPanelTestId.AutoAddressComments}
            toggle="autoAddressComments"
            value={config?.autoAddressComments}
          />
        </Stack>
      )}
    </Panel>
  );
}
