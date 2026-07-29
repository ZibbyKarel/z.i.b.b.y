"use client";

import { Stack, ToggleField, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { QueryError } from "../../../components/LoadError/QueryError";
import { useSetRoadmapConfigMutation } from "../mutations";
import { useRoadmapConfigQuery } from "../queries";

export enum RoadmapAutomationPanelTestId {
  Root = "roadmap-automation-panel",
  AutoSync = "roadmap-automation-auto-sync",
  AutoPlay = "roadmap-automation-auto-play",
}

export interface RoadmapAutomationPanelProps {
  projectId: string;
}

/**
 * The two per-project roadmap automation toggles, on the project's Integrations
 * tab rather than the roadmap tab itself: they answer "what may ZIBBY do on its
 * own with this project's issue sources", which is the same question the
 * channels above them answer — and unlike the Sync button, neither shows its
 * result on the board, so neither earns a place in the board's header.
 *
 * Both apply immediately (no Save button): a toggle IS the commit, the same
 * posture the integration cards' enable switch uses. Each flip PATCHes only its
 * own field — the route merges (see `putRoadmapConfig`'s contract comment), so
 * flipping one can never reset the other, whatever this component last read.
 */
export function RoadmapAutomationPanel({ projectId }: RoadmapAutomationPanelProps) {
  const t = useTranslations("roadmap.automation");
  const configQuery = useRoadmapConfigQuery(projectId);
  const setConfig = useSetRoadmapConfigMutation(projectId);

  const config = configQuery.data;
  // A toggle mid-flight must not invite a second click; a config still loading
  // has no honest state to show, so it reads as off-and-locked rather than
  // flickering into position under the operator's cursor.
  const busy = configQuery.isPending || setConfig.isPending;

  return (
    <HudPanel title={t("title")}>
      {configQuery.isError ? (
        <QueryError onRetry={() => void configQuery.refetch()} />
      ) : (
        <Stack data-testid={RoadmapAutomationPanelTestId.Root} gap="200">
          <Typography size="xs" type="note" variant="tertiary">
            {t("hint")}
          </Typography>
          <ToggleField
            checked={config?.autoSync ?? false}
            data-testid={RoadmapAutomationPanelTestId.AutoSync}
            disabled={busy}
            hint={t("autoSyncHint")}
            label={t("autoSync")}
            onChange={(autoSync) => setConfig.mutate({ params: { projectId }, body: { autoSync } })}
          />
          <ToggleField
            checked={config?.autoPlay ?? false}
            data-testid={RoadmapAutomationPanelTestId.AutoPlay}
            disabled={busy}
            hint={t("autoPlayHint")}
            label={t("autoPlay")}
            onChange={(autoPlay) => setConfig.mutate({ params: { projectId }, body: { autoPlay } })}
          />
        </Stack>
      )}
    </HudPanel>
  );
}
