"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Alert, Button, Grid, Panel, Stack, Typography } from "@zibby/design-system";
import type { Integration } from "@zibby/contracts";
import { IntegrationCard } from "../../integrations/components/IntegrationCard";
import {
  type IntegrationCreateDraft,
  IntegrationFormDialog,
} from "../../integrations/components/IntegrationFormDialog";
import {
  useCompanyIntegrationsQuery,
  useCreateIntegrationMutation,
  useSetCredentialsMutation,
  useTestIntegrationMutation,
  useUpdateIntegrationMutation,
} from "../../integrations";

export enum CompanyIntegrationsPanelTestId {
  Add = "company-add-integration",
  Empty = "company-integrations-empty",
  TestResult = "company-integration-test-result",
}

export interface CompanyIntegrationsPanelProps {
  companyId: string;
}

/**
 * The company's own integrations (Phase 128): one connection shared by every linked
 * project, which route its items with their `integrationRouting` rules. Mirrors the
 * project's integrations panel — cards with test / enable quick actions, Configure
 * NAVIGATES to the company-nested detail page, the create dialog is create-only and
 * stamps `companyId` as the owner.
 */
export function CompanyIntegrationsPanel({ companyId }: CompanyIntegrationsPanelProps) {
  const t = useTranslations();
  const router = useRouter();
  const integrationsQuery = useCompanyIntegrationsQuery(companyId);
  const integrations = integrationsQuery.data ?? [];
  const [creating, setCreating] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const create = useCreateIntegrationMutation();
  const update = useUpdateIntegrationMutation();
  const setCredentials = useSetCredentialsMutation();
  const test = useTestIntegrationMutation();

  const detailHref = (id: string) => `/companies/${companyId}/integrations/${id}` as Route;

  const onCreate = ({ create: body, secret }: IntegrationCreateDraft) => {
    create.mutate(
      { body },
      {
        onSuccess: () => {
          if (secret) {
            setCredentials.mutate({
              params: { id: body.id },
              body: body.kind === "email" ? { password: secret } : { token: secret },
            });
          }
          setCreating(false);
          router.push(detailHref(body.id));
        },
      },
    );
  };

  const onTest = (integration: Integration) => {
    setTestResult(null);
    test.mutate(
      { params: { id: integration.id }, body: {} },
      {
        onSuccess: ({ body }) => setTestResult({ ok: body.ok, detail: body.detail }),
        onError: () => setTestResult({ ok: false, detail: t("integrations.testFailed") }),
      },
    );
  };

  return (
    <Panel
      header={t("companies.integrations.title")}
      headerEnd={
        <Button
          data-testid={CompanyIntegrationsPanelTestId.Add}
          icon="plus"
          intent="primary"
          onClick={() => setCreating(true)}
          size="sm"
        >
          {t("companies.integrations.add")}
        </Button>
      }
      padding="200"
    >
      <Stack gap="150">
        <Typography size="xs" type="note" variant="tertiary">
          {t("companies.integrations.hint")}
        </Typography>
        {testResult && (
          <Alert
            data-testid={CompanyIntegrationsPanelTestId.TestResult}
            onClose={() => setTestResult(null)}
            severity={testResult.ok ? "ok" : "error"}
          >
            {testResult.detail}
          </Alert>
        )}
        {integrations.length === 0 ? (
          <Typography
            data-testid={CompanyIntegrationsPanelTestId.Empty}
            size="sm"
            type="note"
            variant="tertiary"
          >
            {t("companies.integrations.empty")}
          </Typography>
        ) : (
          <Grid align="stretch" cols={1} gap="150" lg={3} md={2}>
            {integrations.map((i) => (
              <IntegrationCard
                integration={i}
                key={i.id}
                onConfigure={(integration) => router.push(detailHref(integration.id))}
                onTest={onTest}
                onToggleEnabled={(integration) =>
                  update.mutate({
                    params: { id: integration.id },
                    body: { enabled: !integration.enabled },
                  })
                }
                testing={test.isPending}
                togglingEnabled={update.isPending}
              />
            ))}
          </Grid>
        )}
      </Stack>

      {creating && (
        <IntegrationFormDialog
          companyId={companyId}
          onClose={() => setCreating(false)}
          onCreate={onCreate}
        />
      )}
    </Panel>
  );
}
