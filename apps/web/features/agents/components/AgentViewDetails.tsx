"use client";

import { useTranslations } from "next-intl";
import { Card, CodeBlock, Container, Icon, Stack, Tag, Typography } from "@zibby/design-system";
import type { Agent } from "@zibby/contracts";
import type { Pipeline } from "../../../domain";
import { ModelBadge, ThinkBadge } from "../../../components/RuntimeBadges/RuntimeBadges";

export interface AgentViewDetailsProps {
  agent: Agent;
  /** Pipelines that reference this agent in one of their phases. */
  usedBy: Pipeline[];
}

/**
 * Read-only body of the agent detail: description, runtime badges, allowed
 * tools, the pipelines the agent appears in, and the Markdown body.
 * Presentational — the modal owns the view/edit switch.
 */
export function AgentViewDetails({ agent, usedBy }: AgentViewDetailsProps) {
  const t = useTranslations("agents");

  return (
    <Stack gap="200">
      <Typography leading="relaxed" size="base" type="note">
        {agent.description}.
      </Typography>

      <Card background="background" radius="sm">
        <Container padding={["150", "150"]}>
          <Stack wrap align="center" direction="row" gap="150">
            <ModelBadge model={agent.model ?? "sonnet"} />
            <ThinkBadge level={agent.thinking ?? "medium"} />
          </Stack>
        </Container>
      </Card>

      <Stack gap="75">
        <Typography mono size="sm" type="note" variant="secondary">
          {t("allowedTools")}
        </Typography>
        <Stack wrap direction="row" gap="75">
          {(agent.tools ?? []).map((tool) => (
            <Tag key={tool} tone="neutral">
              {tool}
            </Tag>
          ))}
        </Stack>
      </Stack>

      <Stack gap="75">
        <Typography mono size="sm" type="note" variant="secondary">
          {t("usedInPipelines")}
        </Typography>
        {usedBy.length > 0 ? (
          <Stack gap="75">
            {usedBy.map((p) => (
              <Card background="background" key={p.id} radius="sm">
                <Container padding={["100", "150"]}>
                  <Stack align="center" direction="row" gap="100">
                    <Icon name="flow" size="sm" tone="accent" />
                    <Container grow minW0>
                      <Typography mono truncate size="sm" type="note">
                        {p.name}
                      </Typography>
                    </Container>
                    <Typography mono nowrap size="xs" type="note" variant="tertiary">
                      {t("phaseCount", { count: p.phases.length })}
                    </Typography>
                  </Stack>
                </Container>
              </Card>
            ))}
          </Stack>
        ) : (
          <Typography mono size="sm" type="note" variant="tertiary">
            {t("notInPipeline")}
          </Typography>
        )}
      </Stack>

      <Stack gap="75">
        <Typography mono size="sm" type="note" variant="secondary">
          {t("fields.body")}
        </Typography>
        <Card background="background" radius="sm">
          <CodeBlock maxHeight="sm" text={agent.instructions} />
        </Card>
      </Stack>
    </Stack>
  );
}
