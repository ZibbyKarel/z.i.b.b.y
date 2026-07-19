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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CategoryDialog } from "../../components/CategoryDialog/CategoryDialog";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { LoadError } from "../../components/LoadError/LoadError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { ImmersivePage } from "../../components/layout/ImmersivePage/ImmersivePage";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { SectionLabel } from "../../components/SectionLabel/SectionLabel";
import { slug } from "../../utils/slug";
import { usePipelinesQuery } from "../pipelines";
import { AgentCard } from "./components/AgentCard";
import { NewAgentDialog } from "./components/NewAgentDialog";
import {
  useCreateAgentMutation,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
} from "./mutations";
import { useAgentsQuery, useCategoriesQuery } from "./queries";

export function Screen() {
  const ta = useTranslations("agents");
  const router = useRouter();
  const agentsQuery = useAgentsQuery();
  const agents = agentsQuery.data ?? [];
  const { data: categories = [] } = useCategoriesQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const createAgent = useCreateAgentMutation();
  const createCategory = useCreateCategoryMutation();
  const deleteCategory = useDeleteCategoryMutation();
  const [creating, setCreating] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);

  const list = agents;

  // Agents whose category was deleted (or never set) must not vanish: surface
  // them in a trailing fallback section instead of dropping them from the catalog.
  const knownNames = new Set(categories.map((c) => c.name));
  const uncategorized = list.filter((a) => !a.category || !knownNames.has(a.category));

  const pipelineCount = (a: Agent) =>
    pipelines.filter((p) => p.phases.some((ph) => ph.agent === a.name)).length;

  // Grammar (N4c): the dialog only births the draft; the new detail page is
  // where the agent lives — navigate straight to it after the create lands.
  const create = (d: Agent) => {
    const id = slug(d.name ?? "") || `agent-${Date.now()}`;
    createAgent.mutate(
      { body: { ...d, id } },
      {
        onSuccess: () => {
          setCreating(false);
          router.push(`/agents/${id}`);
        },
      },
    );
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
                  intent="danger"
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
          <Grid cols={1} gap="150" lg={5} sm={3}>
            {items.map((a) => (
              <AgentCard
                agent={a}
                key={a.id}
                onClick={(x) => router.push(`/agents/${x.id}`)}
                pipelineCount={pipelineCount(a)}
              />
            ))}
          </Grid>
        )}
      </Container>
    );
  };

  return (
    <ImmersivePage
      actions={
        <>
          <Button icon="plus" intent="ghost" onClick={() => setAddingCategory(true)}>
            {ta("addCategory")}
          </Button>
          <Button icon="plus" intent="primary" onClick={() => setCreating(true)}>
            {ta("addAgent")}
          </Button>
        </>
      }
      subtitle={ta("countSummary", { count: list.length })}
      title={ta("title")}
    >
      <Container padding={["300", "350"]}>
        <PageContainer>
          <Stack gap="250">
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
                onAction={() => setCreating(true)}
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
        </PageContainer>
      </Container>

      {creating && (
        <NewAgentDialog
          categories={categories}
          onClose={() => setCreating(false)}
          onCreate={create}
          pending={createAgent.isPending}
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
            createCategory.mutate({ body: category }, { onSuccess: () => setAddingCategory(false) })
          }
          pending={createCategory.isPending}
        />
      )}
    </ImmersivePage>
  );
}
