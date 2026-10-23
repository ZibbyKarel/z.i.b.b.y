"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Container,
  Icon,
  MarkdownEditor,
  Panel,
  Stack,
  type SubNavLinkComponent,
  TextAreaField,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { PageBreadcrumb } from "../../components/layout/PageBreadcrumb";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import type { Automation } from "@zibby/contracts";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { AutomationFormFields, useAutomationFormState } from "./components/AutomationFormFields";
import { TriggerFields } from "./components/TriggerFields";
import {
  useDeleteAutomationMutation,
  useTriggerAutomationMutation,
  useUpdateAutomationMutation,
} from "./mutations";
import { useAutomationQuery } from "./queries";

export enum AutomationDetailScreenTestId {
  Save = "automation-detail-save",
  Run = "automation-detail-run",
  Delete = "automation-detail-delete",
  Name = "automation-detail-name",
  Description = "automation-detail-description",
}

export interface AutomationDetailScreenProps {
  automationId: string;
}

/**
 * The `/work/automations/:id` detail page — the card's Edit action NAVIGATES here,
 * the page IS the edit surface. Three shapes, keyed on `automation.system` and
 * `automation.target.type` (Phase 116e):
 * - **system**: schedule-only ({@link AutomationFormFields}) with a top-right
 *   Save that sends `{ trigger }` alone — everything else is server-owned.
 * - **task** (the "prompt automation" shape, Phase 116b): the SAME
 *   `CommandLine` surface the create dialog uses, seeded from the stored spec —
 *   its own send action IS the save, so there is no top-right Save here.
 * - anything else (a legacy `agent`/`workflow`/`briefing` target predating
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
  const updateAutomation = useUpdateAutomationMutation();
  const deleteAutomation = useDeleteAutomationMutation();
  const triggerAutomation = useTriggerAutomationMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const form = useAutomationFormState(automation);
  const [nameDraft, setNameDraft] = useState(automation.name ?? "");
  const [descriptionDraft, setDescriptionDraft] = useState(automation.description ?? "");
  const [taskText, setTaskText] = useState(
    automation.target.type === "task" ? automation.target.text : "",
  );

  const isSystem = automation.system ?? false;
  const target = automation.target;
  const isTask = target.type === "task";
  const name = automation.name ?? automation.id;
  // System AND the legacy schedule-only fallback both persist ONLY the trigger —
  // the target/name (system: server-owned; legacy: no picker to edit it with) never
  // moves through this path.
  const saveSchedule = () => {
    updateAutomation.mutate({
      params: { id: automation.id },
      body: {
        trigger: form.buildTrigger(),
        // A system automation's name/description are server-owned (the server 409s a change).
        ...(isSystem ? {} : { name: nameDraft.trim(), description: descriptionDraft.trim() }),
      },
    });
  };

  // The `task` automation's own save path: the instruction is edited as Markdown,
  // and the stored routing target + attachments are preserved as-is.
  const saveTask = () => {
    if (target.type !== "task") return;
    updateAutomation.mutate({
      params: { id: automation.id },
      body: {
        trigger: form.buildTrigger(),
        name: nameDraft.trim(),
        description: descriptionDraft.trim(),
        target: { ...target, text: taskText.trim() },
        enabled: automation.enabled,
        approval: form.buildApproval(),
      },
    });
  };

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <PageBreadcrumb
            items={[{ label: t("title"), href: "/work/automations" }, { label: name }]}
            linkComponent={Link as SubNavLinkComponent}
          />

          <Stack wrap align="center" direction="row" gap="150" justify="between">
            <Typography type="h1">{name}</Typography>
            <Stack align="center" direction="row" gap="100">
              <Button
                data-testid={AutomationDetailScreenTestId.Run}
                icon="play"
                intent="ghost"
                loading={triggerAutomation.isPending}
                onClick={() =>
                  triggerAutomation.mutate({ params: { id: automation.id }, body: {} })
                }
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
                disabled={
                  !form.canSave() ||
                  (!isSystem && nameDraft.trim().length === 0) ||
                  (isTask && taskText.trim().length === 0)
                }
                icon="check"
                intent="primary"
                loading={updateAutomation.isPending}
                onClick={isTask ? saveTask : saveSchedule}
                size="sm"
              >
                {t("save")}
              </Button>
            </Stack>
          </Stack>

          <Panel header={t("formEditTitle")} padding="200">
            <Stack gap="200">
              {!isSystem && (
                <Stack gap="150">
                  <TextInputField
                    data-testid={AutomationDetailScreenTestId.Name}
                    label={t("nameLabel")}
                    onChange={(e) => setNameDraft(e.target.value)}
                    value={nameDraft}
                  />
                  <TextAreaField
                    data-testid={AutomationDetailScreenTestId.Description}
                    hint={t("descriptionHint")}
                    label={t("descriptionLabel")}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    rows={2}
                    value={descriptionDraft}
                  />
                </Stack>
              )}
              {isSystem ? (
                <AutomationFormFields isSystem form={form} />
              ) : target.type === "task" ? (
                <Stack gap="200">
                  <TriggerFields form={form} />
                  <MarkdownEditor
                    ariaLabel={t("instructionLabel")}
                    label={t("instructionLabel")}
                    onChange={setTaskText}
                    value={taskText}
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
            </Stack>
          </Panel>
        </Stack>
      </PageContainer>

      {confirmDelete && (
        <ConfirmDeleteDialog
          body={t("deleteBody", { name })}
          cancelLabel={tk("common.cancel")}
          confirmLabel={tk("common.delete")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            deleteAutomation.mutate(
              { params: { id: automation.id } },
              { onSuccess: () => router.push("/work/automations") },
            )
          }
          pending={deleteAutomation.isPending}
          title={t("deleteTitle")}
        />
      )}
    </Container>
  );
}
