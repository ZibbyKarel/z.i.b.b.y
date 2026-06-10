"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Container,
  Icon,
  type IconName,
  Stack,
  Typography,
} from "@zibby/design-system";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { CardGrid } from "../../components/CardGrid/CardGrid";
import { SectionLabel } from "../../components/SectionLabel/SectionLabel";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { AgentCard } from "./components/AgentCard";
import { AgentDetailModal } from "./components/AgentDetailModal";
import { CategoryDialog } from "./components/CategoryDialog";
import { RunModal } from "../skills/components/RunModal/RunModal";
import { newAgentDraft, slugifyAgent } from "./agentDraft";
import { togglePinnedAgent, usePinnedAgents } from "./pinnedAgents";
import { useAgentsQuery, useCategoriesQuery } from "./queries";
import {
  useCreateAgentMutation,
  useCreateCategoryMutation,
  useDeleteAgentMutation,
  useDeleteCategoryMutation,
  useStartAgentRunMutation,
  useUpdateAgentMutation,
} from "./mutations";
import { usePipelinesQuery } from "../pipelines/queries";
import type { Agent } from "@zibby/contracts";

export function Screen() {
  const ta = useTranslations("agents");
  const { data: agents = [] } = useAgentsQuery();
  const { data: categories = [] } = useCategoriesQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const pinned = usePinnedAgents();
  const createAgent = useCreateAgentMutation();
  const updateAgent = useUpdateAgentMutation();
  const deleteAgent = useDeleteAgentMutation();
  const createCategory = useCreateCategoryMutation();
  const deleteCategory = useDeleteCategoryMutation();
  const startAgentRun = useStartAgentRunMutation();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Agent | null>(null);
  const [runAgent, setRunAgent] = useState<Agent | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);

  const list = agents;

  // Agents whose category was deleted (or never set) must not vanish: surface
  // them in a trailing fallback section instead of dropping them from the catalog.
  const knownNames = new Set(categories.map((c) => c.name));
  const uncategorized = list.filter((a) => !a.category || !knownNames.has(a.category));

  const pipelineCount = (a: Agent) =>
    pipelines.filter((p) => p.phases.some((ph) => ph.agent === a.name)).length;

  const openAgent = openId ? (agents.find((a) => a.id === openId) ?? null) : null;

  const save = (d: Agent, isNew: boolean) => {
    if (isNew) {
      const id = slugifyAgent(d.name ?? "") || `agent-${Date.now()}`;
      createAgent.mutate({ body: { ...d, id } }, { onSuccess: () => setOpenId(id) });
      setDraft(null);
    } else {
      const { id, ...body } = d;
      updateAgent.mutate({ params: { id }, body });
    }
  };

  const renderSection = (key: string, label: string, glyph: IconName, items: Agent[]) => {
    const empty = items.length === 0;
    return (
      <Container key={key}>
        <SectionLabel
          action={
            <Stack align="center" direction="row" gap="100">
              <Typography mono size="xs" type="note" variant="tertiary">
                {items.length}
              </Typography>
              {empty && key !== "__uncategorized" && (
                <Button
                  aria-label={ta("deleteEmptyCategoryAria", { name: label })}
                  icon="x"
                  intent="reject"
                  onClick={() => deleteCategory.mutate({ params: { name: label } })}
                  size="sm"
                >
                  {ta("deleteEmptyCategory")}
                </Button>
              )}
            </Stack>
          }
        >
          <Stack inline align="center" as="span" direction="row" gap="50">
            <Icon name={glyph} size="sm" tone="accent" /> {label}
          </Stack>
        </SectionLabel>
        {empty ? (
          <Card background="background" radius="sm">
            <Container padding="200">
              <Stack align="center">
                <Typography mono size="sm" type="note" variant="tertiary">
                  {ta("emptyCategory")}
                </Typography>
              </Stack>
            </Container>
          </Card>
        ) : (
          <CardGrid>
            {items.map((a) => (
              <AgentCard
                agent={a}
                key={a.id}
                onOpen={(x) => setOpenId(x.id)}
                onRun={(x) => setRunAgent(x)}
                onTogglePin={(x) => togglePinnedAgent(x.id)}
                pinned={pinned.includes(a.id)}
                pipelineCount={pipelineCount(a)}
              />
            ))}
          </CardGrid>
        )}
      </Container>
    );
  };

  return (
    <PageContainer>
      <Stack gap="250">
        <PageHeader
          actions={
            <>
              <Button icon="plus" intent="ghost" onClick={() => setAddingCategory(true)}>
                {ta("addCategory")}
              </Button>
              <Button
                icon="plus"
                intent="run"
                onClick={() => setDraft(newAgentDraft(categories[0]?.name))}
              >
                {ta("addAgent")}
              </Button>
            </>
          }
          subtitle={ta("countSummary", { count: list.length })}
          title={ta("title")}
        />

        {categories.length === 0 && list.length === 0 ? (
          <EmptyState
            actionLabel={ta("addAgent")}
            description={ta("emptyDescription")}
            glyph="bot"
            hint={ta("emptyHint")}
            onAction={() => setDraft(newAgentDraft())}
            title={ta("emptyTitle")}
          />
        ) : (
          <>
            {categories.map((cat) =>
              renderSection(
                cat.name,
                cat.name,
                (cat.glyph as IconName) ?? "bot",
                list.filter((a) => a.category === cat.name),
              ),
            )}
            {uncategorized.length > 0 &&
              renderSection("__uncategorized", ta("uncategorized"), "bot", uncategorized)}
          </>
        )}
      </Stack>

      {openAgent && (
        <AgentDetailModal
          agent={openAgent}
          categories={categories}
          key={openAgent.id}
          mode="view"
          onClose={() => setOpenId(null)}
          onDelete={(id) => {
            deleteAgent.mutate({ params: { id } }, { onSuccess: () => setOpenId(null) });
          }}
          onRun={(a) => {
            setRunAgent(a);
            setOpenId(null);
          }}
          onSave={save}
          pipelines={pipelines}
        />
      )}

      {draft && (
        <AgentDetailModal
          agent={draft}
          categories={categories}
          key="new-agent"
          mode="new"
          onClose={() => setDraft(null)}
          onDelete={() => setDraft(null)}
          onRun={() => {}}
          onSave={save}
          pipelines={pipelines}
        />
      )}

      {addingCategory && (
        <CategoryDialog
          existing={categories.map((c) => c.name)}
          onClose={() => setAddingCategory(false)}
          onSubmit={(category) =>
            createCategory.mutate({ body: category }, { onSuccess: () => setAddingCategory(false) })
          }
          pending={createCategory.isPending}
        />
      )}

      {runAgent && (
        <RunModal
          agent={runAgent}
          key={runAgent.id}
          onClose={() => setRunAgent(null)}
          onLaunch={({ agent, prompt, files }) =>
            startAgentRun.mutate({ params: { id: agent.id }, body: { prompt, project: "", files } })
          }
        />
      )}
    </PageContainer>
  );
}
