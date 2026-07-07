"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Grid, Stack } from "@zibby/design-system";
import type { Company } from "@zibby/contracts";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { CompanyCard } from "./components/CompanyCard";
import { useCompaniesQuery } from "./queries";

/**
 * The companies (firma) catalog — mirrors `features/projects/Screen.tsx`, minus
 * the category taxonomy (companies have no category grouping, unlike projects).
 */
export function Screen() {
  const t = useTranslations("companies");
  const router = useRouter();
  const companiesQuery = useCompaniesQuery();
  const companies = companiesQuery.data ?? [];

  const openCompany = (c: Company) => router.push(`/companies/${c.id}`);
  const addCompany = () => router.push("/companies/new");

  return (
    <PageContainer>
      <Stack gap="250">
        <PageHeader
          actions={
            <Button icon="plus" intent="primary" onClick={addCompany}>
              {t("addCompany")}
            </Button>
          }
          subtitle={t("countSummary", { count: companies.length })}
          title={t("title")}
        />

        {companiesQuery.isPending ? (
          <QueryLoading />
        ) : companiesQuery.isError ? (
          <QueryError onRetry={() => void companiesQuery.refetch()} />
        ) : companies.length === 0 ? (
          <EmptyState
            actionLabel={t("addCompany")}
            description={t("emptyDescription")}
            glyph="branch"
            hint={t("emptyHint")}
            onAction={addCompany}
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
    </PageContainer>
  );
}
