"use client";

import type { Automation } from "@zibby/contracts";
import { Button, Container, Icon, type IconName, Stack, Typography } from "@zibby/design-system";
import { Collection } from "@/components/Collection/Collection";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { SectionLabel } from "../../components/SectionLabel/SectionLabel";
import { useAgentsQuery } from "../agents/queries";
import { usePipelinesQuery } from "../pipelines/queries";
import { AutomationCard } from "./components/AutomationCard";
import { AutomationFormDialog } from "./components/AutomationFormDialog";
import {
  useCreateAutomationMutation,
  useTriggerAutomationMutation,
  useUpdateAutomationMutation,
} from "./mutations";
import { useAutomationsQuery } from "./queries";

export function Screen() {
  const t = useTranslations("automations");
  const router = useRouter();
  const automationsQuery = useAutomationsQuery();
  // System automations moved to Settings → Automations — this page is the
  // operator's own automations only.
  const automations = (automationsQuery.data ?? []).filter((a) => !a.system);
  const { data: agents = [] } = useAgentsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const create = useCreateAutomationMutation();
  const update = useUpdateAutomationMutation();
  const trigger = useTriggerAutomationMutation();
  const [creating, setCreating] = useState(false);

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
    if (target.type === "memory-distill") return { glyph: "brain" };
    if (target.type === "self-knowledge") return { glyph: "brain" };
    if (target.type === "task") {
      const kind = target.target?.kind;
      const glyph: IconName = kind === "agent" ? "bot" : kind === "pipeline" ? "flow" : "spark";
      return { name: target.target?.name ?? t("targetTask"), glyph };
    }
    return { glyph: "spark" };
  };

  // Grammar (N4f): the dialog only births the automation; editing lives on the
  // detail page — navigate straight to it after the create lands.
  const onCreate = (body: Omit<Automation, "lastFiredAt" | "system">) => {
    create.mutate(
      { body },
      {
        onSuccess: () => {
          setCreating(false);
          router.push(`/automations/${body.id}`);
        },
      },
    );
  };

  const renderCard = (automation: Automation) => {
    const { name, glyph } = resolveTarget(automation);
    return (
      <AutomationCard
        automation={automation}
        key={automation.id}
        onEdit={() => router.push(`/automations/${automation.id}`)}
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

  const header = (
    <PageHeader
      actions={
        <Button icon="plus" intent="primary" onClick={() => setCreating(true)}>
          {t("addAutomation")}
        </Button>
      }
      subtitle={t("summary", { active: activeCount, total: automations.length })}
      title={t("title")}
    />
  );

  const addModal = creating && (
    <AutomationFormDialog onClose={() => setCreating(false)} onCreate={onCreate} />
  );

  // Honest load states (Phase 18.2): a pending/failed automations fetch must never
  // read as an empty workspace (see Collection's own docstring for the same rule).
  if (automationsQuery.isPending) {
    return (
      <PageContainer>
        <Stack gap="250">
          {header}
          <QueryLoading />
        </Stack>
        {addModal}
      </PageContainer>
    );
  }

  if (automationsQuery.isError) {
    return (
      <PageContainer>
        <Stack gap="250">
          {header}
          <QueryError onRetry={() => void automationsQuery.refetch()} />
        </Stack>
        {addModal}
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Stack gap="250">
        {header}
        <Stack align="center" direction="row" gap="100">
          <Icon name="shield" size="sm" tone="warn" />
          <Typography mono size="2xs" type="micro" variant="tertiary">
            {t("autonomyNote")}
          </Typography>
        </Stack>

        {automations.length === 0 ? (
          <EmptyState
            actionLabel={t("addAutomation")}
            description={t("emptyDescription")}
            glyph="clock"
            onAction={() => setCreating(true)}
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
                <Collection
                  empty={{
                    description: "",
                    glyph: "clock",
                    title: "",
                  }}
                  items={cronAutomations}
                  renderItem={renderCard}
                />
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
      {addModal}
    </PageContainer>
  );
}
