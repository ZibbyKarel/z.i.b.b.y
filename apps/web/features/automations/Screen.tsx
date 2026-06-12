"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Container,
  Divider,
  Icon,
  type IconName,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { Automation } from "@zibby/contracts";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { SectionLabel } from "../../components/SectionLabel/SectionLabel";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { useAgentsQuery } from "../agents/queries";
import { usePipelinesQuery } from "../pipelines/queries";
import { AutomationCard } from "./components/AutomationCard";
import { AutomationFormDialog } from "./components/AutomationFormDialog";
import { useAutomationsQuery } from "./queries";
import {
  useCreateAutomationMutation,
  useTriggerAutomationMutation,
  useUpdateAutomationMutation,
} from "./mutations";

/** Which automation the form dialog is open for: "new", an entity, or closed. */
type Editing = "new" | Automation | null;

export function Screen() {
  const t = useTranslations("automations");
  const { data: automations = [] } = useAutomationsQuery();
  const { data: agents = [] } = useAgentsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const create = useCreateAutomationMutation();
  const update = useUpdateAutomationMutation();
  const trigger = useTriggerAutomationMutation();
  const [editing, setEditing] = useState<Editing>(null);

  /** Resolve a target id to its display name + glyph for the card. */
  const resolveTarget = (automation: Automation): { name?: string; glyph?: IconName } => {
    const { target } = automation;
    if (target.type === "agent") {
      const agent = agents.find((a) => a.id === target.agentId);
      return { name: agent?.name ?? target.agentId, glyph: (agent?.glyph as IconName) ?? "bot" };
    }
    if (target.type === "pipeline") {
      const pipeline = pipelines.find((p) => p.id === target.pipelineId);
      return { name: pipeline?.name ?? target.pipelineId, glyph: "flow" };
    }
    return { glyph: "spark" };
  };

  const onSubmit = (body: Omit<Automation, "lastFiredAt">) => {
    if (editing === "new") {
      create.mutate({ body }, { onSuccess: () => setEditing(null) });
    } else if (editing) {
      update.mutate(
        {
          params: { id: editing.id },
          body: {
            name: body.name,
            trigger: body.trigger,
            target: body.target,
            enabled: body.enabled,
          },
        },
        { onSuccess: () => setEditing(null) },
      );
    }
  };

  const renderCard = (automation: Automation) => {
    const { name, glyph } = resolveTarget(automation);
    return (
      <AutomationCard
        automation={automation}
        key={automation.id}
        onEdit={() => setEditing(automation)}
        onToggle={() =>
          update.mutate({ params: { id: automation.id }, body: { enabled: !automation.enabled } })
        }
        onTrigger={() => trigger.mutate({ params: { id: automation.id }, body: {} })}
        targetGlyph={glyph}
        targetName={name}
        triggering={trigger.isPending}
      />
    );
  };

  const cronAutomations = automations.filter((a) => a.trigger.type === "cron");
  const eventAutomations = automations.filter((a) => a.trigger.type === "event");
  const activeCount = automations.filter((a) => a.enabled).length;

  return (
    <PageContainer>
      <Stack gap="250">
        <Card corners background="panel" data-testid="automations-header" tone="accent">
          <Container padding="250">
            <Stack gap="200">
              <Stack wrap align="start" direction="row" gap="200" justify="between">
                <Container minW0>
                  <Typography size="2xl" type="title" weight="semibold">
                    {t("title")}
                  </Typography>
                  <Container>
                    <Typography mono size="sm" type="note" variant="tertiary">
                      {t("summary", { active: activeCount, total: automations.length })}
                    </Typography>
                  </Container>
                </Container>
                <Button icon="plus" intent="primary" onClick={() => setEditing("new")}>
                  {t("addAutomation")}
                </Button>
              </Stack>
              <Divider />
              <Stack align="center" direction="row" gap="100">
                <Icon name="shield" size="sm" tone="warn" />
                <Typography mono size="2xs" type="micro" variant="tertiary">
                  {t("autonomyNote")}
                </Typography>
              </Stack>
            </Stack>
          </Container>
        </Card>

        {automations.length === 0 ? (
          <EmptyState
            actionLabel={t("addAutomation")}
            description={t("emptyDescription")}
            glyph="clock"
            onAction={() => setEditing("new")}
            title={t("emptyTitle")}
          />
        ) : (
          <Stack gap="250">
            {cronAutomations.length > 0 && (
              <Container>
                <SectionLabel>
                  <Stack inline align="center" direction="row" gap="50">
                    <Icon name="clock" size="sm" tone="accent" /> {t("cronSection")}
                  </Stack>
                </SectionLabel>
                <Stack gap="150">{cronAutomations.map(renderCard)}</Stack>
              </Container>
            )}
            {eventAutomations.length > 0 && (
              <Container>
                <SectionLabel>
                  <Stack inline align="center" direction="row" gap="50">
                    <Icon name="bolt" size="sm" tone="accent" /> {t("eventSection")}
                  </Stack>
                </SectionLabel>
                <Stack gap="150">{eventAutomations.map(renderCard)}</Stack>
              </Container>
            )}
          </Stack>
        )}
      </Stack>

      {editing !== null && (
        <AutomationFormDialog
          agents={agents}
          automation={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSubmit={onSubmit}
          pipelines={pipelines}
        />
      )}
    </PageContainer>
  );
}
