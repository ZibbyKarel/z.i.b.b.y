"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Card, Container, Icon, Stack, Typography } from "@zibby/design-system";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import type { Automation } from "@zibby/contracts";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { CommandLine } from "../tasks/components/CommandLine/CommandLine";
import type { TaskAttachmentSet } from "../tasks/components/TaskAttachments";
import { type TaskTarget, toClientTarget } from "../tasks";
import { AutomationFormFields, useAutomationFormState } from "./components/AutomationFormFields";
import { TriggerFields } from "./components/TriggerFields";
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
 * The `/automations/:id` detail page — the card's Edit action NAVIGATES here,
 * the page IS the edit surface. Three shapes, keyed on `automation.system` and
 * `automation.target.type` (Phase 116e):
 * - **system**: schedule-only ({@link AutomationFormFields}) with a top-right
 *   Save that sends `{ trigger }` alone — everything else is server-owned.
 * - **task** (the "prompt automation" shape, Phase 116b): the SAME
 *   `CommandLine` surface the create dialog uses, seeded from the stored spec —
 *   its own send action IS the save, so there is no top-right Save here.
 * - anything else (a legacy `agent`/`pipeline`/`briefing` target predating
 *   `task`): a minimal schedule-only fallback so the page never crashes,
 *   without rebuilding the retired target/prompt pickers.
 * Every action sits top-right: Run now (the trigger mutation) and Delete
 * behind a confirm dialog. A system automation offers no Delete (the server
 * 409s it anyway).
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
  const updateAutomation = useUpdateAutomationMutation();
  const deleteAutomation = useDeleteAutomationMutation();
  const triggerAutomation = useTriggerAutomationMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const form = useAutomationFormState(automation);

  const isSystem = automation.system ?? false;
  const target = automation.target;
  const isTask = target.type === "task";
  const name = automation.name ?? automation.id;
  const subtitle =
    automation.trigger.type === "cron"
      ? cronLabel(automation.trigger.expr)
      : automation.trigger.events.join(" · ");

  // System AND the legacy schedule-only fallback both persist ONLY the trigger —
  // the target/name (system: server-owned; legacy: no picker to edit it with) never
  // moves through this path.
  const saveSchedule = () => {
    updateAutomation.mutate({ params: { id: automation.id }, body: { trigger: form.buildTrigger() } });
  };

  // The `task` automation's own save path — CommandLine's send action calls this
  // directly (send-delegation mode) instead of a top-right Save button.
  const saveTask = (text: string, tgt?: TaskTarget, attachments?: TaskAttachmentSet) => {
    if (target.type !== "task") return;
    updateAutomation.mutate({
      params: { id: automation.id },
      body: {
        trigger: form.buildTrigger(),
        target: {
          type: "task",
          text: text.trim(),
          target: tgt,
          // CommandLine has no `initialAttachments` — a re-save without attaching new
          // files preserves whatever was already stored rather than dropping it. Known
          // limitation: editing can ADD files, never remove one individually.
          attachmentSetId: attachments?.attachmentSetId ?? target.attachmentSetId,
        },
        enabled: automation.enabled,
      },
    });
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
              {/* A `task` automation saves via CommandLine's own send action below —
                  no top-right Save for it. */}
              {!isTask && (
                <Button
                  data-testid={AutomationDetailScreenTestId.Save}
                  disabled={!form.canSave()}
                  icon="check"
                  intent="primary"
                  loading={updateAutomation.isPending}
                  onClick={saveSchedule}
                  size="sm"
                >
                  {t("save")}
                </Button>
              )}
              <Button intent="ghost" onClick={() => router.push("/automations")} size="sm">
                {tk("common.back")}
              </Button>
            </>
          }
          subtitle={subtitle}
          title={name}
        />

        <HudPanel title={t("formEditTitle")}>
          {isSystem ? (
            <AutomationFormFields isSystem form={form} />
          ) : target.type === "task" ? (
            <Stack gap="200">
              <TriggerFields form={form} />
              <CommandLine
                showAttach
                chrome={false}
                disabled={!form.canSave()}
                initialTarget={target.target ? toClientTarget(target.target) : undefined}
                initialText={target.text}
                onSubmit={saveTask}
                submitLabel={tk("common.save")}
              />
            </Stack>
          ) : (
            <Stack gap="200">
              <Card background="background" radius="default">
                <Container padding="150">
                  <Stack align="start" direction="row" gap="100">
                    <Icon name="shield" size="sm" tone="accent" />
                    <Typography leading="snug" size="caption" type="note" variant="secondary">
                      {t("legacyEditNote")}
                    </Typography>
                  </Stack>
                </Container>
              </Card>
              <TriggerFields form={form} />
            </Stack>
          )}
        </HudPanel>
      </Stack>

      {confirmDelete && (
        <ConfirmDeleteDialog
          body={t("deleteBody", { name })}
          cancelLabel={tk("common.cancel")}
          confirmLabel={tk("common.delete")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            deleteAutomation.mutate(
              { params: { id: automation.id } },
              { onSuccess: () => router.push("/automations") },
            )
          }
          pending={deleteAutomation.isPending}
          title={t("deleteTitle")}
        />
      )}
    </PageContainer>
  );
}
