"use client";

import { useMemo, useState } from "react";
import { Chip, Container, Panel, Pressable, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { KnowledgeSourceBar } from "../components/KnowledgeSourceBar";
import { MemoryGraph } from "../components/MemoryGraph";
import { type TierFilter, filterGraphByTier } from "../filterGraph";
import { useMemoryGraphQuery, useTeamKbGraphQuery } from "../queries";
import { useKnowledgeSource } from "../context";

const TIER_FILTERS: TierFilter[] = ["all", "memory", "daily", "knowledge"];

/**
 * The second-brain node graph. The shared source (`KnowledgeSourceBar`) shows either
 * the local ZibbyCorp vault (tier filter) or a team's read-only knowledge base. A node
 * click opens that note in the Trezor, for the same source.
 */
export function GraphScreen() {
  const t = useTranslations("knowledge");
  const tm = useTranslations("memory");
  const router = useRouter();
  const { teamId, isVault } = useKnowledgeSource();

  const [tier, setTier] = useState<TierFilter>("all");

  const vaultQuery = useMemoryGraphQuery({ enabled: isVault });
  const teamQuery = useTeamKbGraphQuery(teamId);
  const query = isVault ? vaultQuery : teamQuery;
  const graph = query.data;

  const filtered = useMemo(
    () => (graph && isVault ? filterGraphByTier(graph, tier) : graph),
    [graph, isVault, tier],
  );

  const onSelect = (id: string) => {
    const target = isVault
      ? `/knowledge/vault?note=${encodeURIComponent(id)}`
      : `/knowledge/vault?source=${encodeURIComponent(`team:${teamId}`)}&note=${encodeURIComponent(id)}`;
    router.push(target as Route);
  };

  let body;
  if (query.isPending && query.fetchStatus !== "idle") body = <QueryLoading />;
  else if (query.isError) body = <QueryError onRetry={() => void query.refetch()} />;
  else if (!filtered || filtered.nodes.length === 0)
    body = (
      <EmptyState
        description={t("graph.emptyDescription")}
        glyph="brain"
        title={t("graph.emptyTitle")}
      />
    );
  else
    body = (
      <MemoryGraph
        ariaLabel={t("graph.graphLabel")}
        graph={filtered}
        onSelect={onSelect}
        selectedId={null}
      />
    );

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Stack wrap align="end" direction="row" gap="150" justify="between">
            <Typography type="title">{t("graph.title")}</Typography>
            <KnowledgeSourceBar />
          </Stack>

          {isVault && (
            <Stack wrap direction="row" gap="100">
              {TIER_FILTERS.map((value) => (
                <Pressable
                  data-testid={`graph-tier-${value}`}
                  key={value}
                  onClick={() => setTier(value)}
                >
                  <Chip tone={tier === value ? "accent" : "idle"}>{tm(`tier.${value}`)}</Chip>
                </Pressable>
              ))}
            </Stack>
          )}

          <Panel header={t("graph.graphLabel")} padding="200">
            {body}
          </Panel>
        </Stack>
      </PageContainer>
    </Container>
  );
}
