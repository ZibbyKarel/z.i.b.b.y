"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, Container, EmptyState, Grid, Stack, Typography } from "@zibby/design-system";
import type { Company } from "@zibby/contracts";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { CompanyCard } from "../components/CompanyCard";
import { useCompaniesQuery } from "../queries";

/**
 * `/work/companies` (ZB-06) — the company catalog, moved from `/companies`.
 * Mirrors `features/projects/screens/ProjectsListScreen.tsx`'s header pattern
 * (the ZibbyCorp `Container`/eyebrow/`h1` shell), minus the category taxonomy —
 * companies have no category grouping.
 */
export function CompaniesListScreen() {
  const t = useTranslations("companies");
  const router = useRouter();
  const companiesQuery = useCompaniesQuery();
  const companies = companiesQuery.data ?? [];

  const openCompany = (c: Company) => router.push(`/work/companies/${c.id}` as Route);
  const addCompany = () => router.push("/work/companies/new" as Route);

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
          <Button icon="plus" intent="primary" onClick={addCompany}>
            {t("addCompany")}
          </Button>
        </Stack>

        <Typography size="sm" type="note" variant="secondary">
          {t("countSummary", { count: companies.length })}
        </Typography>

        {companiesQuery.isPending ? (
          <QueryLoading />
        ) : companiesQuery.isError ? (
          <QueryError onRetry={() => void companiesQuery.refetch()} />
        ) : companies.length === 0 ? (
          <EmptyState
            action={
              <Button icon="plus" intent="primary" onClick={addCompany}>
                {t("addCompany")}
              </Button>
            }
            body={t("emptyDescription")}
            title={t("emptyTitle")}
          />
        ) : (
          <Grid cols={1} gap="150" lg={3} sm={2}>
            {companies.map((c) => (
              <CompanyCard company={c} key={c.id} onOpen={openCompany} />
            ))}
          </Grid>
        )}
      </Stack>
    </Container>
  );
}
