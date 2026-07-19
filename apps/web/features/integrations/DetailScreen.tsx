"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Alert, Button, Container, Stack } from "@zibby/design-system";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import type { Integration } from "@zibby/contracts";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { ImmersivePage } from "../../components/layout/ImmersivePage/ImmersivePage";
import { PageContainer } from "../../components/PageContainer/PageContainer";
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
 * The project-nested `/projects/:id/integrations/:integrationId` detail page
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
  // Typed routes can't infer a query-string-carrying template stored in a const.
  const backHref = `/projects/${projectId}?tab=integrations` as Route;

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

  return (
    <ImmersivePage
      actions={
        <>
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
        </>
      }
      backHref={backHref}
      subtitle={`${integration.kind} · ${integration.id}`}
      title={name}
    >
      <Container padding={["300", "350"]}>
        <PageContainer>
          <Stack gap="250">
            {testResult && (
              <Alert
                data-testid={IntegrationDetailScreenTestId.TestResult}
                onClose={() => setTestResult(null)}
                severity={testResult.ok ? "ok" : "error"}
              >
                {testResult.detail}
              </Alert>
            )}

            <HudPanel surface="glass" title={t("integrations.detailPanel")}>
              <IntegrationFormFields
                kindLocked
                form={form}
                hasCredentials={integration.hasCredentials}
              />
            </HudPanel>
          </Stack>
        </PageContainer>
      </Container>

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
    </ImmersivePage>
  );
}
