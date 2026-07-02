"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Dialog, Stack, Typography } from "@zibby/design-system";
import type { Automation } from "@zibby/contracts";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { useAgentsQuery } from "../agents/queries";
import { usePipelinesQuery } from "../pipelines/queries";
import { AutomationFormFields, useAutomationFormState } from "./components/AutomationFormFields";
import {
  useDeleteAutomationMutation,
  useTriggerAutomationMutation,
  useUpdateAutomationMutation,
} from "./mutations";
import { useAutomationQuery } from "./queries";
import { useCronLabel } from "./useCronLabel";

export enum AutomationDetailScreenTestId {
  Save = "automation-detail-save",
  Run = "automation-detail-run",
  Delete = "automation-detail-delete",
}

export interface AutomationDetailScreenProps {
  automationId: string;
}

/**
 * The `/automations/:id` detail page (N4f, on the N4c template) — the card's
 * Edit action NAVIGATES here, the page IS the edit surface (the same
 * {@link AutomationFormFields} the create dialog renders) and every action sits
 * top-right: Save (primary), Run now (the trigger mutation) and Delete behind a
 * confirm dialog — the FIRST delete surface automations ever had (the contract
 * existed, the web didn't). A system automation locks everything but the
 * schedule and offers no Delete (the server 409s it anyway).
 */
export function DetailScreen({ automationId }: AutomationDetailScreenProps) {
  const query = useAutomationQuery(automationId);
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;
  if (query.isPending) return <QueryLoading />;
  if (!query.data) return null;
  // The form captures its defaults at mount — key by automation so a different id remounts.
  return <AutomationEditor automation={query.data} key={query.data.id} />;
}

function AutomationEditor({ automation }: { automation: Automation }) {
  const t = useTranslations("automations");
  const tk = useTranslations();
  const router = useRouter();
  const cronLabel = useCronLabel();
  const { data: agents = [] } = useAgentsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const updateAutomation = useUpdateAutomationMutation();
  const deleteAutomation = useDeleteAutomationMutation();
  const triggerAutomation = useTriggerAutomationMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const form = useAutomationFormState(automation);

  const isSystem = automation.system ?? false;
  const name = automation.name ?? automation.id;
  const subtitle =
    automation.trigger.type === "cron"
      ? cronLabel(automation.trigger.expr)
      : automation.trigger.events.join(" · ");

  const save = () => {
    // System automation: only the schedule moves — send the trigger ALONE so we
    // never even attempt the target/name/enabled changes the server would reject.
    const body = isSystem
      ? { trigger: form.buildTrigger() }
      : {
          name: form.name.trim(),
          trigger: form.buildTrigger(),
          target: form.buildTarget(),
          // Always sent (empty string clears it on edit).
          prompt: form.prompt.trim(),
          enabled: automation.enabled,
        };
    updateAutomation.mutate({ params: { id: automation.id }, body });
  };

  return (
    <PageContainer>
      <Stack gap="250">
        <PageHeader
          actions={
            <>
              <Button
                data-testid={AutomationDetailScreenTestId.Run}
                icon="play"
                intent="ghost"
                loading={triggerAutomation.isPending}
                onClick={() => triggerAutomation.mutate({ params: { id: automation.id }, body: {} })}
                size="sm"
              >
                {t("runNow")}
              </Button>
              {!isSystem && (
                <Button
                  data-testid={AutomationDetailScreenTestId.Delete}
                  icon="trash"
                  intent="danger"
                  onClick={() => setConfirmDelete(true)}
                  size="sm"
                >
                  {tk("common.delete")}
                </Button>
              )}
              <Button
                data-testid={AutomationDetailScreenTestId.Save}
                disabled={!form.canSave(isSystem, { agents, pipelines })}
                icon="check"
                intent="primary"
                loading={updateAutomation.isPending}
                onClick={save}
                size="sm"
              >
                {t("save")}
              </Button>
              <Button intent="ghost" onClick={() => router.push("/automations")} size="sm">
                {tk("common.back")}
              </Button>
            </>
          }
          subtitle={subtitle}
          title={name}
        />

        <HudPanel title={t("formEditTitle")}>
          <AutomationFormFields
            agents={agents}
            form={form}
            isSystem={isSystem}
            pipelines={pipelines}
          />
        </HudPanel>
      </Stack>

      {confirmDelete && (
        <Dialog
          open
          actions={
            <>
              <Button intent="ghost" onClick={() => setConfirmDelete(false)}>
                {tk("common.cancel")}
              </Button>
              <Button
                icon="trash"
                intent="danger"
                loading={deleteAutomation.isPending}
                onClick={() =>
                  deleteAutomation.mutate(
                    { params: { id: automation.id } },
                    { onSuccess: () => router.push("/automations") },
                  )
                }
              >
                {tk("common.delete")}
              </Button>
            </>
          }
          onClose={() => setConfirmDelete(false)}
          title={t("deleteTitle")}
          width="sm"
        >
          <Typography size="base" type="note" variant="secondary">
            {t("deleteBody", { name })}
          </Typography>
        </Dialog>
      )}
    </PageContainer>
  );
}
