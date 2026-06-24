import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  Card,
  Container,
  Divider,
  Icon,
  type IconName,
  IconTile,
  Stack,
  StatusDot,
  Tag,
  Toggle,
  Typography,
} from "@zibby/design-system";
import type { Automation, Target } from "@zibby/contracts";
import { nextCronRun, relativeLabel } from "../schedule";
import { useCronLabel } from "../useCronLabel";

/** Testids for the automation card (the screen + tests select via these). */
export enum AutomationCardTestId {
  Root = "automation-card",
  Toggle = "automation-card-toggle",
  Edit = "automation-card-edit",
  Run = "automation-card-run",
  Schedule = "automation-card-schedule",
  Target = "automation-card-target",
  SystemBadge = "automation-card-system",
}

const TRIGGER_GLYPH = { cron: "clock", event: "bolt" } as const satisfies Record<string, IconName>;
const TARGET_GLYPH = {
  agent: "bot",
  pipeline: "flow",
  briefing: "spark",
  discovery: "search",
  "memory-distill": "brain",
  "pattern-extract": "pulse",
  "research-digest": "compass",
  "gap-detect": "flask",
  "app-ideas": "spark",
} as const satisfies Record<Target["type"], IconName>;

export interface AutomationCardProps {
  automation: Automation;
  /** Resolved display name for the target (agent / pipeline); falls back to id. */
  targetName?: string;
  /** Resolved icon for the target; falls back to a per-kind default. */
  targetGlyph?: IconName;
  onToggle: () => void;
  onEdit: () => void;
  onTrigger: () => void;
  triggering?: boolean;
}

/**
 * One automation as a HUD card: status + name + enable toggle on top, the
 * trigger → target flow in the middle, and a footer carrying the last/next run
 * (human-readable, never raw cron) plus the edit / run-now actions.
 */
export function AutomationCard({
  automation,
  targetName,
  targetGlyph,
  onToggle,
  onEdit,
  onTrigger,
  triggering,
}: AutomationCardProps) {
  const t = useTranslations("automations");
  const locale = useLocale();
  const cronLabel = useCronLabel();
  const { trigger, target, enabled } = automation;
  const name = automation.name ?? automation.id;

  const scheduleText =
    trigger.type === "cron" ? cronLabel(trigger.expr) : trigger.events.join(", ");

  const next = useMemo(
    () => (trigger.type === "cron" ? nextCronRun(trigger.expr, new Date()) : null),
    [trigger],
  );

  // Captured once at mount — these labels are coarse (minutes/hours) and the
  // card is short-lived, so freezing "now" avoids an impure render-time read.
  const [now] = useState(() => Date.now());
  const lastLabel = automation.lastFiredAt
    ? t("lastRun", { ago: relativeLabel(Date.parse(automation.lastFiredAt), now, locale) })
    : t("neverRun");
  // A disabled automation won't fire, so it must not advertise a phantom next-run —
  // honest status (North Star "always accountable").
  const nextLabel = !enabled
    ? t("nextOff")
    : trigger.type === "event"
      ? t("onEvent")
      : next
        ? t("nextRun", { when: relativeLabel(next.getTime(), now, locale) })
        : "—";

  const targetText =
    target.type === "briefing"
      ? t("targetBriefing")
      : target.type === "discovery"
        ? t("targetDiscovery")
        : target.type === "memory-distill"
          ? t("targetMemoryDistill")
          : (targetName ?? targetIdOf(target));

  return (
    <Card background="surface" data-testid={AutomationCardTestId.Root}>
      <Container padding="200">
        <Stack gap="150">
          {/* header: status + name + enable toggle */}
          <Stack align="center" direction="row" gap="200" justify="between">
            <Stack align="center" direction="row" gap="100">
              <StatusDot tone={enabled ? "ok" : "idle"} />
              <Container minW0>
                <Typography truncate size="base" type="note" weight="semibold">
                  {name}
                </Typography>
              </Container>
              {automation.system && (
                <Tag data-testid={AutomationCardTestId.SystemBadge} icon="shield" tone="accent">
                  {t("systemBadge")}
                </Tag>
              )}
            </Stack>
            <Stack align="center" direction="row" gap="100">
              <Typography
                size="2xs"
                tone={enabled ? "accent" : undefined}
                type="label"
                variant={enabled ? "secondary" : "tertiary"}
              >
                {enabled ? t("active") : t("off")}
              </Typography>
              <Toggle
                checked={enabled}
                data-testid={AutomationCardTestId.Toggle}
                disabled={automation.system}
                label={t("toggleLabel", { name })}
                onChange={onToggle}
                size="sm"
              />
            </Stack>
          </Stack>

          {/* trigger → target flow */}
          <Stack align="center" direction="row" gap="100">
            <FlowBox
              glyph={TRIGGER_GLYPH[trigger.type]}
              kind={t(trigger.type === "cron" ? "triggerCron" : "triggerEvent")}
              testid={AutomationCardTestId.Schedule}
              value={scheduleText}
            />
            <Icon name="arrow" size="sm" tone="faint" />
            <FlowBox
              glyph={targetGlyph ?? TARGET_GLYPH[target.type]}
              kind={t(targetKindKey(target.type))}
              testid={AutomationCardTestId.Target}
              value={targetText}
            />
          </Stack>

          <Divider />

          {/* footer: last / next run + actions */}
          <Stack wrap align="center" direction="row" gap="150" justify="between">
            <Stack wrap align="center" direction="row" gap="150">
              <Typography mono size="2xs" type="micro" variant="tertiary">
                {lastLabel}
              </Typography>
              <Typography mono size="2xs" type="micro" variant="tertiary">
                {nextLabel}
              </Typography>
            </Stack>
            <Stack align="center" direction="row" gap="100">
              <Button
                data-testid={AutomationCardTestId.Edit}
                icon="edit"
                intent="ghost"
                onClick={onEdit}
                size="sm"
              >
                {t("edit")}
              </Button>
              <Button
                data-testid={AutomationCardTestId.Run}
                icon="play"
                intent="primary"
                loading={triggering}
                onClick={onTrigger}
                size="sm"
              >
                {t("runNow")}
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}

/** A bordered trigger/target tile: glyph + uppercase kind + the spec value. */
function FlowBox({
  glyph,
  kind,
  value,
  testid,
}: {
  glyph: IconName;
  kind: string;
  value: string;
  testid?: string;
}) {
  return (
    <Container grow minW0>
      <Card background="background" radius="default">
        <Container padding={["100", "150"]}>
          <Stack align="center" direction="row" gap="100">
            <IconTile glyph={glyph} size="sm" />
            <Container grow minW0>
              <Stack gap="25">
                <Typography size="2xs" type="label" variant="tertiary">
                  {kind}
                </Typography>
                <Typography mono truncate data-testid={testid} size="caption" type="note">
                  {value}
                </Typography>
              </Stack>
            </Container>
          </Stack>
        </Container>
      </Card>
    </Container>
  );
}

/** Display id for a non-briefing target (used when no resolved name is supplied). */
function targetIdOf(target: Target): string {
  return target.type === "agent"
    ? target.agentId
    : target.type === "pipeline"
      ? target.pipelineId
      : "";
}

/** i18n key for the target kind label. Exhaustive over the target union. */
function targetKindKey(
  type: Target["type"],
):
  | "targetAgent"
  | "targetPipeline"
  | "targetBriefing"
  | "targetDiscovery"
  | "targetMemoryDistill"
  | "targetPatternExtract"
  | "targetResearchDigest"
  | "targetGapDetect"
  | "targetAppIdeas" {
  switch (type) {
    case "agent":
      return "targetAgent";
    case "pipeline":
      return "targetPipeline";
    case "briefing":
      return "targetBriefing";
    case "discovery":
      return "targetDiscovery";
    case "memory-distill":
      return "targetMemoryDistill";
    case "pattern-extract":
      return "targetPatternExtract";
    case "research-digest":
      return "targetResearchDigest";
    case "gap-detect":
      return "targetGapDetect";
    case "app-ideas":
      return "targetAppIdeas";
  }
}
