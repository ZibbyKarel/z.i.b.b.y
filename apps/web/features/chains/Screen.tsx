"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Chain, ChainRun } from "@zibby/contracts";
import { Button, Card, Container, Grid, Icon, Stack, Tag, Typography } from "@zibby/design-system";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { usePipelinesQuery } from "../pipelines";
import { useNewTask } from "../tasks";
import { NewChainDialog } from "./components/NewChainDialog";
import { useCreateChainMutation, useDeleteChainMutation } from "./mutations";
import { useChainRunsQuery, useChainsQuery } from "./queries";

/** Testids for the chains screen (tests select via these). */
export enum ChainsScreenTestId {
  Card = "chain-card",
  Run = "chain-run",
  Delete = "chain-delete",
  RunRow = "chain-run-row",
}

export interface ScreenProps {
  /** Pre-selected chain id from the [id] route segment. */
  selectedId?: string;
}

/** Tone for a chain-run status tag. */
function runTone(status: ChainRun["status"]): "ok" | "warn" | "bad" | "run" {
  if (status === "done") return "ok";
  if (status === "parked") return "warn";
  if (status === "failed") return "bad";
  return "run";
}

/**
 * The chains section (N4a): the operator's pipeline compositions — "research
 * overnight, then build from the result" — listed as cards (click navigates to
 * `/chains/:id`), with the detail's primary actions top-right and a dialog only
 * for create (the interaction grammar).
 */
export function Screen({ selectedId: routeId }: ScreenProps) {
  const t = useTranslations("chains");
  const router = useRouter();
  const chainsQuery = useChainsQuery();
  const chains = chainsQuery.data ?? [];
  const { data: runs = [] } = useChainRunsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const createChain = useCreateChainMutation();
  const deleteChain = useDeleteChainMutation();
  const { open: openNewTask } = useNewTask();
  const [adding, setAdding] = useState(false);

  const selected = (routeId ? chains.find((c) => c.id === routeId) : null) ?? chains[0];
  const selectedRuns = selected ? runs.filter((r) => r.chainId === selected.id) : [];

  const addModal = adding && (
    <NewChainDialog
      isPending={createChain.isPending}
      onClose={() => setAdding(false)}
      onCreate={(body) =>
        createChain.mutate(
          { body },
          {
            onSuccess: () => {
              setAdding(false);
              router.push(`/chains/${body.id}`);
            },
          },
        )
      }
      pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))}
    />
  );

  const header = (
    <PageHeader
      actions={
        <Button icon="plus" intent="primary" onClick={() => setAdding(true)}>
          {t("addChain")}
        </Button>
      }
      subtitle={t("countSummary", { count: chains.length })}
      title={t("title")}
    />
  );

  if (chainsQuery.isPending) {
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

  if (chainsQuery.isError) {
    return (
      <PageContainer>
        <Stack gap="250">
          {header}
          <QueryError onRetry={() => void chainsQuery.refetch()} />
        </Stack>
        {addModal}
      </PageContainer>
    );
  }

  if (chains.length === 0) {
    return (
      <PageContainer>
        <Stack gap="250">
          {header}
          <EmptyState
            actionLabel={t("addChain")}
            description={t("emptyDescription")}
            glyph="link"
            hint={t("emptyHint")}
            onAction={() => setAdding(true)}
            title={t("emptyTitle")}
          />
        </Stack>
        {addModal}
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Stack gap="250">
        {header}
        <Grid center align="start" gap="250" maxWidth="1400px" sidebar="left">
          <Stack gap="150">
            {chains.map((chain) => (
              <ChainCard
                chain={chain}
                key={chain.id}
                onSelect={(id) => router.push(`/chains/${id}`)}
                selected={chain.id === (selected?.id ?? "")}
              />
            ))}
          </Stack>

          {selected && (
            <Stack gap="250">
              <HudPanel padding="250">
                <Stack gap="200">
                  <Stack wrap align="start" direction="row" gap="200" justify="between">
                    <Container grow minW0>
                      <Stack gap="100">
                        <Typography size="3xl" type="title" weight="semibold">
                          {selected.name ?? selected.id}
                        </Typography>
                        {selected.instructions && (
                          <Typography mono size="caption" type="note" variant="secondary">
                            {selected.instructions}
                          </Typography>
                        )}
                      </Stack>
                    </Container>
                    <Stack align="center" direction="row" gap="100">
                      <Button
                        data-testid={ChainsScreenTestId.Delete}
                        disabled={deleteChain.isPending}
                        icon="x"
                        intent="ghost"
                        onClick={() =>
                          deleteChain.mutate(
                            { params: { id: selected.id } },
                            { onSuccess: () => router.push("/chains") },
                          )
                        }
                        size="sm"
                      >
                        {t("delete")}
                      </Button>
                      <Button
                        data-testid={ChainsScreenTestId.Run}
                        icon="play"
                        intent="primary"
                        onClick={() =>
                          openNewTask(undefined, {
                            kind: "chain",
                            id: selected.id,
                            name: selected.name ?? selected.id,
                            glyph: "link",
                          })
                        }
                      >
                        {t("runChain")}
                      </Button>
                    </Stack>
                  </Stack>
                  <StepFlow chain={selected} />
                </Stack>
              </HudPanel>

              <HudPanel padding="250" title={t("runsTitle")}>
                {selectedRuns.length === 0 ? (
                  <Typography mono size="xs" type="note" variant="tertiary">
                    {t("noRuns")}
                  </Typography>
                ) : (
                  <Stack gap="150">
                    {selectedRuns.map((run) => (
                      <Stack data-testid={ChainsScreenTestId.RunRow} gap="75" key={run.chainRunId}>
                        <Stack align="center" direction="row" gap="100" justify="between">
                          <Typography mono size="xs" type="note" variant="secondary">
                            {run.chainRunId}
                          </Typography>
                          <Tag size="sm" tone={runTone(run.status)}>
                            {t(`state.${run.status}`)}
                          </Tag>
                        </Stack>
                        <Stack wrap align="center" direction="row" gap="75">
                          {run.steps.map((step) => (
                            <Tag
                              key={`${run.chainRunId}-${step.index}`}
                              size="sm"
                              tone={
                                step.status === "done"
                                  ? "ok"
                                  : step.status === "failed"
                                    ? "bad"
                                    : step.status === "running"
                                      ? "run"
                                      : "neutral"
                              }
                            >
                              {`${step.index + 1}. ${step.pipeline}`}
                            </Tag>
                          ))}
                        </Stack>
                        {run.parkedReason && (
                          <Typography mono leading="snug" size="2xs" tone="warn" type="note">
                            {run.parkedReason}
                          </Typography>
                        )}
                      </Stack>
                    ))}
                  </Stack>
                )}
              </HudPanel>
            </Stack>
          )}
        </Grid>
        {addModal}
      </Stack>
    </PageContainer>
  );
}

/** One chain in the list — the whole card is the navigation affordance. */
function ChainCard({
  chain,
  selected,
  onSelect,
}: {
  chain: Chain;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("chains");
  return (
    <Card
      aria-label={t("openChain", { name: chain.name ?? chain.id })}
      aria-pressed={selected}
      as="button"
      data-testid={ChainsScreenTestId.Card}
      interactive={!selected}
      onClick={() => onSelect(chain.id)}
      selected={selected}
    >
      <Stack gap="75">
        <Typography size="md" type="title" weight="semibold">
          {chain.name ?? chain.id}
        </Typography>
        <Typography mono size="2xs" type="note" variant="tertiary">
          {t("stepsSummary", { count: chain.steps.length })}
        </Typography>
      </Stack>
    </Card>
  );
}

/** The ordered step flow: pipeline → pipeline, artifact-mediated. */
function StepFlow({ chain }: { chain: Chain }) {
  return (
    <Stack wrap align="center" direction="row" gap="100">
      {chain.steps.map((step, index) => (
        <Stack align="center" direction="row" gap="100" key={`${step.pipeline}-${index}`}>
          {index > 0 && <Icon name="chevron" size="xs" tone="faint" />}
          <Tag size="sm" tone="neutral">
            {step.pipeline}
          </Tag>
        </Stack>
      ))}
    </Stack>
  );
}
