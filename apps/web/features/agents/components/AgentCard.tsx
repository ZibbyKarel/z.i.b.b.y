import { useTranslations } from "next-intl";
import { Button, Chip, Icon, type IconName, Stack } from "@zibby/design-system";
import type { Agent } from "@zibby/contracts";
import { ModelBadge, ThinkBadge } from "../../pipelines/components/PhaseChain";
import { HudCard } from "../../../components/HudCard/HudCard";

export interface AgentCardProps {
  agent: Agent;
  /** How many pipelines reference this agent (drives the usage chip). */
  pipelineCount?: number;
  /** Whether this agent is pinned to the Overview quick-launch panel. */
  pinned?: boolean;
  onOpen?: (agent: Agent) => void;
  onRun?: (agent: Agent) => void;
  /** When provided, renders a pin toggle; omit to hide the control entirely. */
  onTogglePin?: (agent: Agent) => void;
}

export function AgentCard({
  agent,
  pipelineCount = 0,
  pinned = false,
  onOpen,
  onRun,
  onTogglePin,
}: AgentCardProps) {
  const t = useTranslations("agents");
  const name = agent.name ?? agent.id;
  const tools = agent.tools ?? [];

  return (
    <HudCard
      actions={
        <Stack align="center" direction="row" gap="100" justify="end">
          <Button icon="play" intent="run" onClick={() => onRun?.(agent)} size="sm">
            {t("run")}
          </Button>
        </Stack>
      }
      badges={[
        [
          <ModelBadge key="model" model={agent.model ?? "sonnet"} />,
          <ThinkBadge key="think" level={agent.thinking ?? "medium"} />,
          pipelineCount > 0 ? (
            <Chip key="usage" tone="accent">
              <Icon name="flow" size="xs" /> {t("pipelineUsage", { count: pipelineCount })}
            </Chip>
          ) : null,
        ],
        tools.map((tool) => (
          <Chip key={tool} tone="neutral">
            {tool}
          </Chip>
        )),
      ]}
      description={agent.description}
      glyph={(agent.glyph as IconName | undefined) ?? "bot"}
      onOpen={onOpen ? () => onOpen(agent) : undefined}
      onPinChange={onTogglePin ? () => onTogglePin(agent) : undefined}
      openLabel={t("openAria", { name })}
      pinLabel={t("pin", { name })}
      pinned={pinned}
      title={name}
      unpinLabel={t("unpin", { name })}
    />
  );
}
