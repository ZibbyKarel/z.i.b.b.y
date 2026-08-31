"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Container, Grid } from "@zibby/design-system";
import type { Team } from "@zibby/contracts";
import { ImmersivePage } from "../../components/layout/ImmersivePage/ImmersivePage";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { TeamCard } from "./components/TeamCard";
import { useTeamsQuery } from "./queries";

/**
 * The team catalog — the layer between Company and Project that owns a
 * read-only knowledge base. Mirrors `features/companies/Screen.tsx`.
 */
export function Screen() {
  const t = useTranslations("teams");
  const router = useRouter();
  const teamsQuery = useTeamsQuery();
  const teams = teamsQuery.data ?? [];

  const openTeam = (team: Team) => router.push(`/teams/${team.id}`);
  const addTeam = () => router.push("/teams/new");

  return (
    <ImmersivePage
      actions={
        <Button icon="plus" intent="primary" onClick={addTeam}>
          {t("addTeam")}
        </Button>
      }
      subtitle={t("countSummary", { count: teams.length })}
      title={t("title")}
    >
      <Container padding={["300", "350"]}>
        <PageContainer>
          {teamsQuery.isPending ? (
            <QueryLoading />
          ) : teamsQuery.isError ? (
            <QueryError onRetry={() => void teamsQuery.refetch()} />
          ) : teams.length === 0 ? (
            <EmptyState
              actionLabel={t("addTeam")}
              description={t("emptyDescription")}
              glyph="grid"
              hint={t("emptyHint")}
              onAction={addTeam}
              title={t("emptyTitle")}
            />
          ) : (
            <Grid cols={1} gap="150" lg={3} sm={2}>
              {teams.map((team) => (
                <TeamCard key={team.id} onOpen={openTeam} team={team} />
              ))}
            </Grid>
          )}
        </PageContainer>
      </Container>
    </ImmersivePage>
  );
}
