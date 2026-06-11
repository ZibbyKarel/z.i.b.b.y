import { useTranslations } from "next-intl";
import { Button, Icon, type IconName, Stack, Tag } from "@zibby/design-system";
import type { Agent } from "@zibby/contracts";
import { ModelBadge, ThinkBadge } from "../../pipelines/components/PhaseChain";
import { HudCard } from "../../../components/HudCard/HudCard";

export interface AgentCardProps {
  agent: Agent;
  /** How many pipelines reference this agent (drives the usage chip). */
  pipelineCount?: number;
  onOpen?: (agent: Agent) => void;
  onRun?: (agent: Agent) => void;
}

export function AgentCard({
  agent,
  pipelineCount = 0,
  onOpen,
  onRun,
}: AgentCardProps) {
  const t = useTranslations("agents");
  const name = agent.name ?? agent.id;
  const tools = agent.tools ?? [];

  return (
    <HudCard
      actions={
        <Stack align="center" direction="row" gap="100" justify="end">
          <Button icon="play" intent="primary" onClick={() => onRun?.(agent)} size="sm">
            {t("run")}
          </Button>
        </Stack>
      }
      badges={[
        [
          <ModelBadge key="model" model={agent.model ?? "sonnet"} />,
          <ThinkBadge key="think" level={agent.thinking ?? "medium"} />,
          pipelineCount > 0 ? (
            <Tag key="usage" tone="accent">
              <Icon name="flow" size="xs" /> {t("pipelineUsage", { count: pipelineCount })}
            </Tag>
          ) : null,
        ],
        tools.map((tool) => (
          <Tag key={tool} tone="neutral">
            {tool}
          </Tag>
        )),
      ]}
      description={agent.description}
      glyph={(agent.glyph as IconName | undefined) ?? "bot"}
      onOpen={onOpen ? () => onOpen(agent) : undefined}
      openLabel={t("openAria", { name })}
      title={name}
    />
  );
}
