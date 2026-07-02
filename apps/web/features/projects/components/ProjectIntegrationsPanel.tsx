"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Alert, Button, Grid, Stack, Typography } from "@zibby/design-system";
import type { Integration } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { IntegrationCard } from "../../integrations/components/IntegrationCard";
import {
  type IntegrationCreateDraft,
  IntegrationFormDialog,
} from "../../integrations/components/IntegrationFormDialog";
import {
  useCreateIntegrationMutation,
  useIntegrationsQuery,
  useSetCredentialsMutation,
  useTestIntegrationMutation,
  useUpdateIntegrationMutation,
} from "../../integrations";

export interface ProjectIntegrationsPanelProps {
  /** The project that owns the integrations shown here (one project = one company). */
  projectId: string;
}

/**
 * The integrations section on the project detail. Integrations are owned by a
 * project (there is no global integrations page); this panel lists the
 * project's channels with labeled quick actions (test, enable toggle) — while
 * Configure NAVIGATES to the project-nested integration detail page (N4h
 * grammar), which also owns delete (behind a confirm; the card used to delete
 * unconfirmed). The create dialog is create-only and lands on the new detail.
 */
export function ProjectIntegrationsPanel({ projectId }: ProjectIntegrationsPanelProps) {
  const t = useTranslations();
  const router = useRouter();
  const integrationsQuery = useIntegrationsQuery(projectId);
  const integrations = integrationsQuery.data ?? [];
  const [creating, setCreating] = useState(false);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; detail: string } | null>(
    null,
  );

  const create = useCreateIntegrationMutation();
  const update = useUpdateIntegrationMutation();
  const setCredentials = useSetCredentialsMutation();
  const test = useTestIntegrationMutation();

  const onCreate = ({ create: body, secret }: IntegrationCreateDraft) => {
    create.mutate(
      { body },
      {
        onSuccess: () => {
          if (secret) {
            setCredentials.mutate({
              params: { id: body.id },
              // Email authenticates with a password; Slack/Jira/GitHub all carry a token.
              body: body.kind === "email" ? { password: secret } : { token: secret },
            });
          }
          setCreating(false);
          router.push(`/projects/${projectId}/integrations/${body.id}`);
        },
      },
    );
  };

  const onTest = (integration: Integration) => {
    setTestResult(null);
    test.mutate(
      { params: { id: integration.id }, body: {} },
      {
        onSuccess: ({ body }) =>
          setTestResult({ id: integration.id, ok: body.ok, detail: body.detail }),
        onError: () =>
          setTestResult({ id: integration.id, ok: false, detail: t("integrations.testFailed") }),
      },
    );
  };

  return (
    <HudPanel
      action={
        <Button
          data-testid="add-integration"
          icon="plus"
          intent="primary"
          onClick={() => setCreating(true)}
          size="sm"
        >
          {t("projects.integrations.add")}
        </Button>
      }
      title={t("projects.integrations.title")}
    >
      <Stack gap="150">
        {testResult && (
          <Alert
            data-testid="integration-test-result"
            onClose={() => setTestResult(null)}
            severity={testResult.ok ? "ok" : "error"}
          >
            {testResult.detail}
          </Alert>
        )}

        {integrations.length === 0 && (
          <Typography size="sm" type="note" variant="tertiary">
            {t("projects.integrations.empty")}
          </Typography>
        )}

        {integrations.length > 0 && (
          // Three columns on wide screens (collapsing to two / one) so the cards
          // stay compact instead of stretching the full panel width.
          <Grid align="stretch" cols={1} gap="150" lg={3} md={2}>
            {integrations.map((i) => (
              <IntegrationCard
                integration={i}
                key={i.id}
                onConfigure={(integration) =>
                  router.push(`/projects/${projectId}/integrations/${integration.id}`)
                }
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
          onClose={() => setCreating(false)}
          onCreate={onCreate}
          projectId={projectId}
        />
      )}
    </HudPanel>
  );
}
