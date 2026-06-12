"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@zibby/design-system";
import type { Integration } from "@zibby/contracts";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { SectionToolbar } from "../../components/SectionToolbar/SectionToolbar";
import { Collection } from "../../components/Collection/Collection";
import { IntegrationCard } from "./components/IntegrationCard";
import { type IntegrationDraft, IntegrationFormDialog } from "./components/IntegrationFormDialog";
import { useIntegrationsQuery } from "./queries";
import {
  useCreateIntegrationMutation,
  useSetCredentialsMutation,
  useTestIntegrationMutation,
  useUpdateIntegrationMutation,
} from "./mutations";

/** Which integration the form dialog is open for: "new", an entity, or closed. */
type Editing = "new" | Integration | null;

export function Screen() {
  const t = useTranslations();
  const { data: integrations = [] } = useIntegrationsQuery();
  const [editing, setEditing] = useState<Editing>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; detail: string } | null>(null);

  const create = useCreateIntegrationMutation();
  const update = useUpdateIntegrationMutation();
  const setCredentials = useSetCredentialsMutation();
  const test = useTestIntegrationMutation();

  /** Persist a freshly entered secret (if any) for an integration. */
  const persistSecret = (id: string, kind: Integration["kind"], secret: string | undefined) => {
    if (!secret) return;
    setCredentials.mutate({
      params: { id },
      body: kind === "slack" ? { token: secret } : { password: secret },
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

  return (
    <PageContainer>
      <SectionToolbar
        addLabel={t("integrations.addIntegration")}
        label={t("integrations.sectionLabel")}
        onAdd={() => setEditing("new")}
      />

      {testResult && (
        <Alert
          data-testid="integration-test-result"
          onClose={() => setTestResult(null)}
          severity={testResult.ok ? "ok" : "error"}
        >
          {testResult.detail}
        </Alert>
      )}

      <Collection
        empty={{
          glyph: "plug",
          title: t("integrations.emptyTitle"),
          description: t("integrations.emptyDescription"),
          actionLabel: t("integrations.addIntegration"),
          hint: t("integrations.emptyHint"),
          onAction: () => setEditing("new"),
        }}
        items={integrations}
        renderItem={(i) => (
          <IntegrationCard
            integration={i}
            key={i.id}
            onConfigure={(integration) => setEditing(integration)}
            onTest={onTest}
            testing={test.isPending}
          />
        )}
      />

      {editing !== null && (
        <IntegrationFormDialog
          integration={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSubmit={onSubmit}
        />
      )}
    </PageContainer>
  );
}
