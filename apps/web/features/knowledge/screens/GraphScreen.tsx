"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Chip,
  Container,
  Panel,
  Pressable,
  SegmentedControl,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { useTeamsQuery } from "../../teams/queries";
import { MemoryGraph } from "../components/MemoryGraph";
import { type TierFilter, filterGraphByTier } from "../filterGraph";
import { useMemoryGraphQuery, useTeamKbGraphQuery } from "../queries";

const TIER_FILTERS: TierFilter[] = ["all", "memory", "daily", "knowledge"];
const VAULT = "vault";
const TEAM_PREFIX = "team:";

/**
 * The second-brain node graph. A source switch (`?source=vault|team:<id>`) shows
 * either the local ZibbyCorp vault (tier filter, node click opens the note) or a
 * team's read-only knowledge base (node click shows its title and path).
 */
export function GraphScreen() {
  const t = useTranslations("knowledge");
  const tm = useTranslations("memory");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: teams } = useTeamsQuery();

  const kbTeams = useMemo(() => (teams ?? []).filter((team) => team.knowledgeBase), [teams]);
  const rawSource = searchParams.get("source") ?? VAULT;
  const teamId = rawSource.startsWith(TEAM_PREFIX) ? rawSource.slice(TEAM_PREFIX.length) : null;
  const isVault = teamId === null;

  const [tier, setTier] = useState<TierFilter>("all");
  const [picked, setPicked] = useState<string | null>(null);

  const vaultQuery = useMemoryGraphQuery({ enabled: isVault });
  const teamQuery = useTeamKbGraphQuery(teamId);
  const query = isVault ? vaultQuery : teamQuery;
  const graph = query.data;

  const filtered = useMemo(
    () => (graph && isVault ? filterGraphByTier(graph, tier) : graph),
    [graph, isVault, tier],
  );
  const pickedNode = !isVault ? filtered?.nodes.find((n) => n.id === picked) : undefined;

  const setSource = (value: string) => {
    setPicked(null);
    router.replace(`${pathname}?source=${encodeURIComponent(value)}` as Route);
  };
  const onSelect = (id: string) => {
    if (isVault) router.push(`/knowledge/vault?note=${encodeURIComponent(id)}` as Route);
    else setPicked(id);
  };

  const sources = [
    { value: VAULT, label: t("graph.sourceVault") },
    ...kbTeams.map((team) => ({ value: `${TEAM_PREFIX}${team.id}`, label: team.name })),
  ];

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
        selectedId={isVault ? null : picked}
      />
    );

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Stack wrap align="end" direction="row" gap="150" justify="between">
            <Typography type="title">{t("graph.title")}</Typography>
            <SegmentedControl
              ariaLabel={t("graph.sourceLabel")}
              items={sources}
              onChange={setSource}
              value={isVault ? VAULT : rawSource}
            />
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

          {pickedNode && (
            <Panel header={pickedNode.label} padding="150">
              <Stack gap="100">
                <Typography mono size="sm" type="note" variant="tertiary">
                  {t("graph.path")}: {pickedNode.id}
                </Typography>
                <Button intent="ghost" onClick={() => setPicked(null)} size="sm">
                  {t("graph.clear")}
                </Button>
              </Stack>
            </Panel>
          )}
        </Stack>
      </PageContainer>
    </Container>
  );
}
