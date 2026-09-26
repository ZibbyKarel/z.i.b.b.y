"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Breadcrumb,
  Button,
  Container,
  Panel,
  Stack,
  type SubNavLinkComponent,
  Typography,
} from "@zibby/design-system";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import type { Integration } from "@zibby/contracts";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { IntegrationAutonomyPanel } from "./components/IntegrationAutonomyPanel";
import { IntegrationFormFields, useIntegrationFormState } from "./components/IntegrationFormFields";
import {
  useDeleteIntegrationMutation,
  useSetCredentialsMutation,
  useTestIntegrationMutation,
  useUpdateIntegrationMutation,
} from "./mutations";
import { useIntegrationQuery } from "./queries";

export enum IntegrationDetailScreenTestId {
  Save = "integration-detail-save",
  Test = "integration-detail-test",
  Delete = "integration-detail-delete",
  TestResult = "integration-detail-test-result",
}

export interface IntegrationDetailScreenProps {
  /** The owning project — the back navigation returns to its integrations tab. */
  projectId: string;
  integrationId: string;
}

/**
 * The project-nested `/work/projects/:id/integrations/:integrationId` detail page
 * (N4h, closing the grammar series; GitLab's Settings → Webhooks → webhook-page
 * precedent) — the card's Configure action NAVIGATES here, the page IS the edit
 * surface (the same {@link IntegrationFormFields} the create dialog renders;
 * kind + id locked) and Save / Test / Delete sit top-right; delete asks in a
 * confirm dialog (the card used to delete unconfirmed). A freshly entered
 * secret still rides out-of-band through the separate credentials mutation
 * (email → `password`, everything else → `token`).
 */
export function DetailScreen({ projectId, integrationId }: IntegrationDetailScreenProps) {
  const query = useIntegrationQuery(integrationId);
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;
  if (query.isPending) return <QueryLoading />;
  if (!query.data) return null;
  // The form captures its defaults at mount — key by integration so a different id remounts.
  return <IntegrationEditor integration={query.data} key={query.data.id} projectId={projectId} />;
}

function IntegrationEditor({
  integration,
  projectId,
}: {
  integration: Integration;
  projectId: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const updateIntegration = useUpdateIntegrationMutation();
  const deleteIntegration = useDeleteIntegrationMutation();
  const setCredentials = useSetCredentialsMutation();
  const testIntegration = useTestIntegrationMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const form = useIntegrationFormState(projectId, integration);

  const name = integration.name ?? integration.id;
  const backHref = `/work/projects/${projectId}/integrations` as Route;

  const save = () => {
    updateIntegration.mutate(
      { params: { id: integration.id }, body: form.buildPatch() },
      {
        onSuccess: () => {
          const secret = form.newSecret();
          if (secret) {
            setCredentials.mutate({
              params: { id: integration.id },
              // Email authenticates with a password; Slack/Jira/GitHub all carry a token.
              body: integration.kind === "email" ? { password: secret } : { token: secret },
            });
          }
        },
      },
    );
  };

  const test = () => {
    setTestResult(null);
    testIntegration.mutate(
      { params: { id: integration.id }, body: {} },
      {
        onSuccess: ({ body }) => setTestResult({ ok: body.ok, detail: body.detail }),
        onError: () => setTestResult({ ok: false, detail: t("integrations.testFailed") }),
      },
    );
  };

  const subtitle = `${integration.kind} · ${integration.id}`;

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Breadcrumb
            items={[{ label: t("projects.integrations.title"), href: backHref }, { label: name }]}
            linkComponent={Link as SubNavLinkComponent}
          />

          <Stack wrap align="center" direction="row" gap="150" justify="between">
            <Stack gap="25">
              <Typography type="h1">{name}</Typography>
              <Typography mono size="xs" type="note" variant="tertiary">
                {subtitle}
              </Typography>
            </Stack>
            <Stack align="center" direction="row" gap="100">
              <Button
                data-testid={IntegrationDetailScreenTestId.Test}
                icon="pulse"
                intent="ghost"
                loading={testIntegration.isPending}
                onClick={test}
                size="sm"
              >
                {t("integrations.testConnection")}
              </Button>
              <Button
                data-testid={IntegrationDetailScreenTestId.Delete}
                icon="trash"
                intent="danger"
                onClick={() => setConfirmDelete(true)}
                size="sm"
              >
                {t("common.delete")}
              </Button>
              <Button
                data-testid={IntegrationDetailScreenTestId.Save}
                disabled={!form.canSave(false)}
                icon="check"
                intent="primary"
                loading={updateIntegration.isPending}
                onClick={save}
                size="sm"
              >
                {t("common.save")}
              </Button>
            </Stack>
          </Stack>

          {testResult && (
            <Alert
              data-testid={IntegrationDetailScreenTestId.TestResult}
              onClose={() => setTestResult(null)}
              severity={testResult.ok ? "ok" : "error"}
            >
              {testResult.detail}
            </Alert>
          )}

          <Panel header={t("integrations.detailPanel")} padding="200">
            <IntegrationFormFields
              kindLocked
              form={form}
              hasCredentials={integration.hasCredentials}
            />
          </Panel>

          <IntegrationAutonomyPanel integrationId={integration.id} />
        </Stack>
      </PageContainer>

      {confirmDelete && (
        <ConfirmDeleteDialog
          body={t("integrations.deleteBody", { name })}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("common.delete")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            deleteIntegration.mutate(
              { params: { id: integration.id } },
              { onSuccess: () => router.push(backHref) },
            )
          }
          pending={deleteIntegration.isPending}
          title={t("integrations.deleteTitle")}
        />
      )}
    </Container>
  );
}
