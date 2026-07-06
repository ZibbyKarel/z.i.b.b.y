import type { Agent } from "@zibby/contracts";
import { Icon, type IconName, Tag } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudCard } from "../../../components/HudCard/HudCard";
import { ModelBadge, ThinkBadge } from "../../../components/RuntimeBadges/RuntimeBadges";

export interface AgentCardProps {
  agent: Agent;
  /** How many pipelines reference this agent (drives the usage chip). */
  pipelineCount?: number;
  onClick?: (agent: Agent) => void;
}

export function AgentCard({ agent, pipelineCount = 0, onClick }: AgentCardProps) {
  const t = useTranslations("agents");
  const name = agent.name ?? agent.id;
  const tools = agent.tools ?? [];

  return (
    <HudCard
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
      logoSrc={agent.avatar}
      onClick={onClick ? () => onClick(agent) : undefined}
      openLabel={t("openAria", { name })}
      title={name}
    />
  );
}
