"use client";

import { Button, Container, Grid, type IconName, Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudCard } from "../../../../components/HudCard/HudCard";
import { HudPanel } from "../../../../components/HudPanel/HudPanel";
import { useAgentsQuery } from "../../../agents";
import { useChainsQuery } from "../../../chains";
import { usePipelinesQuery } from "../../../pipelines";
import { usePinToggle } from "../../../pins";
import { useNewTask } from "../../../tasks";

export enum QuickLaunchPanelTestId {
  Row = "quick-launch-row",
  Run = "quick-launch-run",
  Unpin = "quick-launch-unpin",
}

interface ResolvedPin {
  kind: "agent" | "pipeline" | "chain";
  id: string;
  name: string;
  glyph: IconName;
}

/** Localized kind label shown as the card's meta line (matches the agent/pipeline
 * card grammar where a mono sub-line names the entity type). */
const KIND_LABEL: Record<ResolvedPin["kind"], "kindAgent" | "kindPipeline" | "kindChain"> = {
  agent: "kindAgent",
  pipeline: "kindPipeline",
  chain: "kindChain",
};

/**
 * Overview "Panel rychlého spuštění" (this plan): every pinned agent/pipeline/
 * chain, resolved live against its catalog so a rename shows up without any
 * pin-side bookkeeping. An entity deleted after being pinned silently drops out of
 * this list (the pin itself is left on disk — no write-on-read side effect;
 * unpinning is still explicit from the detail page or this panel). Renders nothing
 * while there is nothing pinned, same as {@link ParkedRunsPanel}.
 *
 * Each pin now renders as a simplified {@link HudCard} — the same glyph-tile + mono
 * title card the /agents and /pipelines master lists use — laid out in a responsive
 * grid so the panel fills its width instead of stacking full-bleed rows.
 *
 * Since phase-05 chain is a normal `TaskTarget`, so RUN opens the New Task dialog
 * with a prefilled target for all three kinds — one path, no chain special case.
 */
export function QuickLaunchPanel() {
  const t = useTranslations("pins");
  const { pins, toggle } = usePinToggle();
  const { data: agents = [] } = useAgentsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const { data: chains = [] } = useChainsQuery();
  const { open: openNewTask } = useNewTask();

  const resolved: ResolvedPin[] = pins.flatMap((pin): ResolvedPin[] => {
    if (pin.kind === "agent") {
      const agent = agents.find((a) => a.id === pin.id);
      if (!agent) return [];
      return [
        {
          kind: "agent" as const,
          id: agent.id,
          name: agent.name ?? agent.id,
          glyph: (agent.glyph as IconName | undefined) ?? "bot",
        },
      ];
    }
    if (pin.kind === "pipeline") {
      const pipeline = pipelines.find((p) => p.id === pin.id);
      if (!pipeline) return [];
      return [{ kind: "pipeline" as const, id: pipeline.id, name: pipeline.name ?? pipeline.id, glyph: "flow" }];
    }
    const chain = chains.find((c) => c.id === pin.id);
    if (!chain) return [];
    return [{ kind: "chain" as const, id: chain.id, name: chain.name ?? chain.id, glyph: "link" }];
  });

  if (resolved.length === 0) return null;

  return (
    <HudPanel title={t("quickLaunchTitle")}>
      <Grid cols={1} gap="150" sm={2}>
        {resolved.map((item) => (
          <Container data-testid={QuickLaunchPanelTestId.Row} key={`${item.kind}:${item.id}`}>
            <HudCard
              actions={
                <Stack align="center" direction="row" gap="100">
                  <Container grow minW0>
                    <Button
                      block
                      data-testid={QuickLaunchPanelTestId.Run}
                      icon="play"
                      intent="primary"
                      onClick={() =>
                        openNewTask(undefined, {
                          kind: item.kind,
                          id: item.id,
                          name: item.name,
                          glyph: item.glyph,
                        })
                      }
                      size="sm"
                    >
                      {t("run")}
                    </Button>
                  </Container>
                  <Button
                    aria-label={t("unpinAria", { name: item.name })}
                    data-testid={QuickLaunchPanelTestId.Unpin}
                    icon="x"
                    intent="ghost"
                    onClick={() => toggle(item.kind, item.id)}
                    size="sm"
                  />
                </Stack>
              }
              glyph={item.glyph}
              subtitle={t(KIND_LABEL[item.kind])}
              title={item.name}
            />
          </Container>
        ))}
      </Grid>
    </HudPanel>
  );
}
