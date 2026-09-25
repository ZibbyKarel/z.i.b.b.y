"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, Container, EmptyState, Grid, Stack, Typography } from "@zibby/design-system";
import type { Team } from "@zibby/contracts";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { TeamCard } from "../components/TeamCard";
import { useTeamsQuery } from "../queries";

/**
 * `/work/teams` (ZB-06) — the team catalog, moved from `/teams`. Mirrors
 * `CompaniesListScreen` (D-003: teams follow the companies pattern).
 */
export function TeamsListScreen() {
  const t = useTranslations("teams");
  const router = useRouter();
  const teamsQuery = useTeamsQuery();
  const teams = teamsQuery.data ?? [];

  const openTeam = (team: Team) => router.push(`/work/teams/${team.id}` as Route);
  const addTeam = () => router.push("/work/teams/new" as Route);

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="baseline" direction="row" gap="150" justify="between">
          <Stack wrap align="baseline" direction="row" gap="150">
            <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
              {t("eyebrow")}
            </Typography>
            <Typography type="h1">{t("title")}</Typography>
          </Stack>
          <Button icon="plus" intent="primary" onClick={addTeam}>
            {t("addTeam")}
          </Button>
        </Stack>

        <Typography size="sm" type="note" variant="secondary">
          {t("countSummary", { count: teams.length })}
        </Typography>

        {teamsQuery.isPending ? (
          <QueryLoading />
        ) : teamsQuery.isError ? (
          <QueryError onRetry={() => void teamsQuery.refetch()} />
        ) : teams.length === 0 ? (
          <EmptyState
            action={
              <Button icon="plus" intent="primary" onClick={addTeam}>
                {t("addTeam")}
              </Button>
            }
            body={t("emptyDescription")}
            title={t("emptyTitle")}
          />
        ) : (
          <Grid cols={1} gap="150" lg={3} sm={2}>
            {teams.map((team) => (
              <TeamCard key={team.id} onOpen={openTeam} team={team} />
            ))}
          </Grid>
        )}
      </Stack>
    </Container>
  );
}
