"use client";

import { Button, Container, Icon, type IconName, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
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

/**
 * Overview "Panel rychlého spuštění" (this plan): every pinned agent/pipeline/
 * chain, resolved live against its catalog so a rename shows up without any
 * pin-side bookkeeping. An entity deleted after being pinned silently drops out of
 * this list (the pin itself is left on disk — no write-on-read side effect;
 * unpinning is still explicit from the detail page or this panel). Renders nothing
 * while there is nothing pinned, same as {@link ParkedRunsPanel}.
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
      <Stack gap="100">
        {resolved.map((item) => (
          <Stack
            align="center"
            data-testid={QuickLaunchPanelTestId.Row}
            direction="row"
            gap="100"
            key={`${item.kind}:${item.id}`}
          >
            <Icon name={item.glyph} size="sm" tone="dim" />
            <Container grow minW0>
              <Typography truncate size="sm" type="note" weight="medium">
                {item.name}
              </Typography>
            </Container>
            <Button
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
            <Button
              aria-label={t("unpinAria", { name: item.name })}
              data-testid={QuickLaunchPanelTestId.Unpin}
              icon="x"
              intent="ghost"
              onClick={() => toggle(item.kind, item.id)}
              size="sm"
            />
          </Stack>
        ))}
      </Stack>
    </HudPanel>
  );
}
