"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Grid, Stack, Typography } from "@zibby/design-system";
import type { Integration } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { IntegrationCard } from "../../integrations/components/IntegrationCard";
import {
  type IntegrationDraft,
  IntegrationFormDialog,
} from "../../integrations/components/IntegrationFormDialog";
import { useIntegrationsQuery } from "../../integrations/queries";
import {
  useCreateIntegrationMutation,
  useDeleteIntegrationMutation,
  useSetCredentialsMutation,
  useTestIntegrationMutation,
  useUpdateIntegrationMutation,
} from "../../integrations/mutations";

/** Which integration the form dialog is open for: "new", an entity, or closed. */
type Editing = "new" | Integration | null;

export interface ProjectIntegrationsPanelProps {
  /** The project that owns the integrations shown here (one project = one company). */
  projectId: string;
}

/**
 * The integrations section on the project detail. Integrations are owned by a
 * project now (there is no global integrations page); this panel lists the
 * project's channels and lets the operator add, configure, test, set credentials
 * for, or remove one — all scoped to `projectId` (the create payload carries it,
 * the list query filters by it).
 */
export function ProjectIntegrationsPanel({ projectId }: ProjectIntegrationsPanelProps) {
  const t = useTranslations();
  const integrationsQuery = useIntegrationsQuery(projectId);
  const integrations = integrationsQuery.data ?? [];
  const [editing, setEditing] = useState<Editing>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; detail: string } | null>(
    null,
  );

  const create = useCreateIntegrationMutation();
  const update = useUpdateIntegrationMutation();
  const remove = useDeleteIntegrationMutation();
  const setCredentials = useSetCredentialsMutation();
  const test = useTestIntegrationMutation();

  /** Persist a freshly entered secret (if any) for an integration. */
  const persistSecret = (id: string, kind: Integration["kind"], secret: string | undefined) => {
    if (!secret) return;
    setCredentials.mutate({
      params: { id },
      // Email authenticates with a password; Slack/Jira/GitHub all carry a token.
      body: kind === "email" ? { password: secret } : { token: secret },
    });
  };

  const onSubmit = (draft: IntegrationDraft) => {
    if (draft.create) {
      const { id, kind } = draft.create;
      create.mutate(
        { body: draft.create },
        { onSuccess: () => persistSecret(id, kind, draft.secret) },
      );
    } else if (draft.update) {
      const { id, patch } = draft.update;
      const kind = (editing !== "new" && editing?.kind) || "slack";
      update.mutate(
        { params: { id }, body: patch },
        { onSuccess: () => persistSecret(id, kind, draft.secret) },
      );
    }
    setEditing(null);
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

  const onDelete = (integration: Integration) => {
    remove.mutate({ params: { id: integration.id } });
  };

  return (
    <HudPanel
      action={
        <Button
          data-testid="add-integration"
          icon="plus"
          intent="primary"
          onClick={() => setEditing("new")}
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
                onConfigure={(integration) => setEditing(integration)}
                onDelete={onDelete}
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

      {editing !== null && (
        <IntegrationFormDialog
          integration={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSubmit={onSubmit}
          projectId={projectId}
        />
      )}
    </HudPanel>
  );
}
