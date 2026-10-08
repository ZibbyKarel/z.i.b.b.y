import type { Agent } from "@zibby/contracts";
import { Card, Container, Divider, Icon, IconTile, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { type Workflow, glyphForPhase } from "../../../../domain";
import { WorkflowOwnerChip } from "./WorkflowOwnerChip";

export interface WorkflowCardProps {
  showPhases?: boolean;
  workflow: Workflow;
  agents: Agent[];
  selected: boolean;
  onSelect: (id: string) => void;
}

/** Master-list card for a workflow: name, phase chips + owner. */
export function WorkflowCard({
  workflow,
  showPhases,
  agents,
  selected,
  onSelect,
}: WorkflowCardProps) {
  const t = useTranslations("workflows");
  return (
    <Card
      aria-pressed={selected}
      as="button"
      interactive={!selected}
      onClick={() => onSelect(workflow.id)}
      selected={selected}
    >
      <Container padding="150">
        <Stack gap="150">
          <Stack align="start" direction="row" gap="150">
            <IconTile alt={workflow.name} glyph="flow" size="md" src={workflow.avatar} />
            <Stack gap="75">
              <Typography mono size="md" type="note" weight="bold">
                {workflow.name}
              </Typography>
              <Typography leading="snug" size="caption" type="note" variant="secondary">
                {workflow.desc}
              </Typography>
            </Stack>
          </Stack>

          <Stack wrap align="center" direction="row" gap="75">
            {showPhases &&
              workflow.phases.map((ph, i) => (
                <Fragment key={`${ph.agent ?? ph.type}-${i}`}>
                  <Stack inline align="center" direction="row" gap="50">
                    <Icon name={glyphForPhase(ph, agents)} size="xs" tone="accent" />
                    <Typography mono size="xs" type="note" variant="secondary">
                      {ph.type === "verify"
                        ? t("verify")
                        : ph.type === "workflow"
                          ? ph.workflow
                          : ph.agent}
                    </Typography>
                  </Stack>
                  {i < workflow.phases.length - 1 && <Icon name="arrow" size="xs" tone="faint" />}
                </Fragment>
              ))}
          </Stack>

          <Divider />
          <Stack align="center" direction="row" justify="between">
            {workflow.department ? (
              <WorkflowOwnerChip department={workflow.department} />
            ) : (
              <span />
            )}
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
