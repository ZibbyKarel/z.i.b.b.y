import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Chip,
  Container,
  Divider,
  type DotTone,
  Icon,
  IconTile,
  Pressable,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import type { AgentDef } from "../../../domain";
import { ModelBadge, ThinkBadge } from "../../pipelines/components/PhaseChain";

export interface AgentCardProps {
  agent: AgentDef;
  /** How many pipelines reference this agent (drives the usage chip). */
  pipelineCount?: number;
  onOpen?: (agent: AgentDef) => void;
  onRun?: (agent: AgentDef) => void;
  onToggleEnabled?: (agent: AgentDef) => void;
}

interface StateMeta {
  tone: DotTone;
  labelKey: string;
  pulse: boolean;
}

function stateMeta(agent: AgentDef): StateMeta {
  if (agent.enabled === false) {
    return { tone: "warn", labelKey: "agents.paused", pulse: false };
  }
  if (agent.state === "pipeline") {
    return { tone: "accent", labelKey: "agents.statePipeline", pulse: true };
  }
  if (agent.state === "running") {
    return { tone: "accent", labelKey: "agents.stateRunning", pulse: true };
  }
  return { tone: "faint", labelKey: "agents.stateIdle", pulse: false };
}

export function AgentCard({
  agent,
  pipelineCount = 0,
  onOpen,
  onRun,
  onToggleEnabled,
}: AgentCardProps) {
  const t = useTranslations("agents");
  const tk = useTranslations();
  const meta = stateMeta(agent);
  const paused = agent.enabled === false;

  return (
    <Card corners interactive radius="sm">
      <Container padding="150" position="relative">
        {/* pause / activate — top-right */}
        <Container position="absolute" right="0" style={{ top: 0 }} zIndex={2}>
          <IconTile
            interactive
            aria-label={paused ? t("activateAria", { name: agent.name }) : t("pauseAria", { name: agent.name })}
            as="button"
            onClick={() => onToggleEnabled?.(agent)}
            radius="default"
            size="sm"
            tone={paused ? "accent" : "neutral"}
          >
            <Icon name={paused ? "play" : "pause"} size="xs" />
          </IconTile>
        </Container>

        <Stack gap="150" style={{ opacity: paused ? 0.62 : 1 }}>
          <Pressable
            aria-label={t("openAria", { name: agent.name })}
            onClick={() => onOpen?.(agent)}
            style={{ display: "block", textAlign: "left" }}
          >
            <Stack gap="150">
              <Stack align="start" direction="row" gap="150">
                <IconTile glyph={agent.glyph} size="md" />
                <Container grow minW0 style={{ paddingRight: "1.5rem" }}>
                  <Stack gap="25">
                    <Typography mono truncate size="md" type="note" weight="semibold">
                      {agent.name}
                    </Typography>
                    <Container
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      <Typography leading="snug" size="caption" type="note" variant="secondary">
                        {agent.role}
                      </Typography>
                    </Container>
                  </Stack>
                </Container>
              </Stack>

              <Stack wrap direction="row" gap="75">
                <ModelBadge model={agent.model} />
                <ThinkBadge level={agent.thinking} />
                {pipelineCount > 0 && (
                  <Chip tone="accent">
                    <Icon name="flow" size="xs" /> {t("pipelineUsage", { count: pipelineCount })}
                  </Chip>
                )}
              </Stack>

              {agent.tools.length > 0 && (
                <Stack wrap direction="row" gap="75">
                  {agent.tools.map((tool) => (
                    <Chip key={tool} tone="neutral">
                      {tool}
                    </Chip>
                  ))}
                </Stack>
              )}
            </Stack>
          </Pressable>

          <Divider />

          <Stack align="center" direction="row" gap="100" justify="between">
            <Stack align="center" direction="row" gap="75">
              <StatusDot pulse={meta.pulse} tone={meta.tone} />
              <Typography mono nowrap size="xs" type="note" variant="tertiary">
                {tk(meta.labelKey)} · {agent.runs ?? 0}×
              </Typography>
            </Stack>
            <Button icon="play" intent="run" onClick={() => onRun?.(agent)} size="sm">
              {t("run")}
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
