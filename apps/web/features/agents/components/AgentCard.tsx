import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Chip,
  Container,
  Divider,
  Icon,
  type IconName,
  IconTile,
  Pressable,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { Agent } from "@zibby/contracts";
import { ModelBadge, ThinkBadge } from "../../pipelines/components/PhaseChain";

export interface AgentCardProps {
  agent: Agent;
  /** How many pipelines reference this agent (drives the usage chip). */
  pipelineCount?: number;
  onOpen?: (agent: Agent) => void;
  onRun?: (agent: Agent) => void;
}

export function AgentCard({ agent, pipelineCount = 0, onOpen, onRun }: AgentCardProps) {
  const t = useTranslations("agents");
  const name = agent.name ?? agent.id;
  const tools = agent.tools ?? [];

  return (
    <Card corners interactive radius="sm">
      <Container padding="150" position="relative">
        <Stack gap="150">
          <Pressable aria-label={t("openAria", { name })} onClick={() => onOpen?.(agent)}>
            <Container textAlign="left">
              <Stack gap="150">
              <Stack align="start" direction="row" gap="150">
                <IconTile glyph={(agent.glyph as IconName | undefined) ?? "bot"} size="md" />
                <Container grow minW0>
                  <Stack gap="25">
                    <Typography mono truncate size="md" type="note" weight="semibold">
                      {name}
                    </Typography>
                    {/* 2-line clamp: -webkit-line-clamp has no DS equivalent. */}
                    {/* eslint-disable-next-line react/forbid-dom-props */}
                    <div style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}>
                      <Typography leading="snug" size="caption" type="note" variant="secondary">
                        {agent.description}
                      </Typography>
                    </div>
                  </Stack>
                </Container>
              </Stack>

              <Stack wrap direction="row" gap="75">
                <ModelBadge model={agent.model ?? "sonnet"} />
                <ThinkBadge level={agent.thinking ?? "medium"} />
                {pipelineCount > 0 && (
                  <Chip tone="accent">
                    <Icon name="flow" size="xs" /> {t("pipelineUsage", { count: pipelineCount })}
                  </Chip>
                )}
              </Stack>

              {tools.length > 0 && (
                <Stack wrap direction="row" gap="75">
                  {tools.map((tool) => (
                    <Chip key={tool} tone="neutral">
                      {tool}
                    </Chip>
                  ))}
                </Stack>
              )}
              </Stack>
            </Container>
          </Pressable>

          <Divider />

          <Stack align="center" direction="row" gap="100" justify="end">
            <Button icon="play" intent="run" onClick={() => onRun?.(agent)} size="sm">
              {t("run")}
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
