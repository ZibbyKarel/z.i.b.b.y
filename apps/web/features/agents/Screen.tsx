"use client";

import type { Agent } from "@zibby/contracts";
import {
  Button,
  Card,
  Container,
  Grid,
  Icon,
  type IconName,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CategoryDialog } from "../../components/CategoryDialog/CategoryDialog";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { LoadError } from "../../components/LoadError/LoadError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { SectionLabel } from "../../components/SectionLabel/SectionLabel";
import { slug } from "../../utils/slug";
import { usePipelinesQuery } from "../pipelines/queries";
import { useNewTask } from "../tasks/TaskContext";
import { newAgentDraft } from "./agentDraft";
import { AgentCard } from "./components/AgentCard";
import { AgentDetailModal } from "./components/AgentDetailModal";
import {
  useCreateAgentMutation,
  useCreateCategoryMutation,
  useDeleteAgentMutation,
  useDeleteCategoryMutation,
  useUpdateAgentMutation,
} from "./mutations";
import { useAgentsQuery, useCategoriesQuery } from "./queries";

export function Screen() {
  const ta = useTranslations("agents");
  const agentsQuery = useAgentsQuery();
  const agents = agentsQuery.data ?? [];
  const { data: categories = [] } = useCategoriesQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const createAgent = useCreateAgentMutation();
  const updateAgent = useUpdateAgentMutation();
  const deleteAgent = useDeleteAgentMutation();
  const createCategory = useCreateCategoryMutation();
  const deleteCategory = useDeleteCategoryMutation();
  const { open: openNewTask } = useNewTask();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Agent | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);

  const list = agents;

  // Agents whose category was deleted (or never set) must not vanish: surface
  // them in a trailing fallback section instead of dropping them from the catalog.
  const knownNames = new Set(categories.map((c) => c.name));
  const uncategorized = list.filter(
    (a) => !a.category || !knownNames.has(a.category),
  );

  const pipelineCount = (a: Agent) =>
    pipelines.filter((p) => p.phases.some((ph) => ph.agent === a.name)).length;

  const openAgent = openId
    ? (agents.find((a) => a.id === openId) ?? null)
    : null;

  const save = (d: Agent, isNew: boolean) => {
    if (isNew) {
      const id = slug(d.name ?? "") || `agent-${Date.now()}`;
      createAgent.mutate(
        { body: { ...d, id } },
        { onSuccess: () => setOpenId(id) },
      );
      setDraft(null);
    } else {
      const { id, ...body } = d;
      updateAgent.mutate({ params: { id }, body });
    }
  };

  const renderSection = (
    key: string,
    label: string,
    glyph: IconName,
    items: Agent[],
  ) => {
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
                  intent="danger"
                  onClick={() =>
                    deleteCategory.mutate({ params: { name: label } })
                  }
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
          <Grid cols={1} gap="150" lg={5} sm={3}>
            {items.map((a) => (
              <AgentCard
                agent={a}
                key={a.id}
                onClick={(x) => setOpenId(x.id)}
                pipelineCount={pipelineCount(a)}
              />
            ))}
          </Grid>
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
              <Button
                icon="plus"
                intent="ghost"
                onClick={() => setAddingCategory(true)}
              >
                {ta("addCategory")}
              </Button>
              <Button
                icon="plus"
                intent="primary"
                onClick={() => setDraft(newAgentDraft(categories[0]?.name))}
              >
                {ta("addAgent")}
              </Button>
            </>
          }
          subtitle={ta("countSummary", { count: list.length })}
          title={ta("title")}
        />

        {agentsQuery.isPending ? (
          <QueryLoading />
        ) : agentsQuery.isError ? (
          // Honest status: a failed load must not read as an empty workspace (which would
          // say "create your first agent" — and could nudge re-creating ones that exist).
          <LoadError
            description={ta("loadErrorDescription")}
            onRetry={() => void agentsQuery.refetch()}
            retryLabel={ta("retry")}
            title={ta("loadErrorTitle")}
          />
        ) : categories.length === 0 && list.length === 0 ? (
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
              renderSection(
                "__uncategorized",
                ta("uncategorized"),
                "bot",
                uncategorized,
              )}
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
            deleteAgent.mutate(
              { params: { id } },
              { onSuccess: () => setOpenId(null) },
            );
          }}
          onRun={(a) => {
            if (!a.id) return;
            // Only a task runs: pre-select the agent in the New Task dialog (the
            // classifier still runs and the target stays changeable) instead of
            // starting an agent run directly.
            openNewTask(undefined, { kind: "agent", id: a.id, name: a.name ?? a.id, glyph: "bot" });
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
          labels={{
            title: ta("categoryDialog.title"),
            subtitle: ta("categoryDialog.subtitle"),
            nameLabel: ta("categoryDialog.nameLabel"),
            namePlaceholder: ta("categoryDialog.namePlaceholder"),
            glyphLabel: ta("categoryDialog.glyphLabel"),
            submit: ta("addCategory"),
            duplicate: (name) => ta("categoryDialog.duplicate", { name }),
          }}
          onClose={() => setAddingCategory(false)}
          onSubmit={(category) =>
            createCategory.mutate(
              { body: category },
              { onSuccess: () => setAddingCategory(false) },
            )
          }
          pending={createCategory.isPending}
        />
      )}
    </PageContainer>
  );
}
