"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Button,
  Container,
  EntityHero,
  type IconName,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import type { Agent, GateRuleInput } from "@zibby/contracts";
import { AVATAR_MAX } from "@zibby/contracts";
import { useFormControls } from "@zibby/forms";
import { toastBus } from "../../components/Toaster/toastBus";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { ImmersivePage } from "../../components/layout/ImmersivePage/ImmersivePage";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { RuleModal } from "../gates/components/RuleModal";
import { PinButton } from "../pins";
import { usePipelinesQuery } from "../pipelines";
import { useNewTask } from "../tasks";
import { agentFile } from "./agentDraft";
import { AgentEditBasics } from "./components/AgentEditBasics";
import { AgentRulesSection } from "./components/AgentRulesSection";
import {
  type AgentEditValues,
  applyFormValues,
  ownRuleToInitial,
  toFormValues,
} from "./components/agentEditValues";
import { useDeleteAgentMutation, useUpdateAgentMutation } from "./mutations";
import { useAgentQuery, useCategoriesQuery } from "./queries";

export enum AgentDetailScreenTestId {
  Save = "agent-detail-save",
  Run = "agent-detail-run",
  Delete = "agent-detail-delete",
}

export interface AgentDetailScreenProps {
  agentId: string;
}

/**
 * The `/agents/:id` detail page (N4c) — the grammar-conformant replacement for
 * the old view/edit dialog: a card click NAVIGATES here, the page IS the edit
 * surface (one form over the Basics + Rules panels) and every action sits
 * top-right in the header — Save (primary), Run (New-Task pre-fill; the target
 * stays changeable, the classifier still runs) and Delete (confirm dialog, the
 * one dialog this page keeps).
 */
export function DetailScreen({ agentId }: AgentDetailScreenProps) {
  const query = useAgentQuery(agentId);
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;
  if (query.isPending) return <QueryLoading />;
  if (!query.data) return null;
  // The form captures its defaults at mount — key by agent so a different id remounts.
  return <AgentEditor agent={query.data} key={query.data.id} />;
}

function AgentEditor({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tk = useTranslations();
  const router = useRouter();
  const { data: categories = [] } = useCategoriesQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const updateAgent = useUpdateAgentMutation();
  const deleteAgent = useDeleteAgentMutation();
  const { open: openNewTask } = useNewTask();

  const [confirmDelete, setConfirmDelete] = useState(false);
  /** The own-rule being edited: an index, "new", or null when the editor is closed. */
  const [editingRule, setEditingRule] = useState<number | "new" | null>(null);

  const name = agent.name ?? agent.id;
  const usedBy = pipelines.filter((p) => p.phases.some((ph) => ph.agent === agent.name));

  const { renderForm, submit, form } = useFormControls<AgentEditValues>({
    defaultValues: toFormValues(agent),
    onSubmit: (values) => {
      const { id, ...body } = applyFormValues(agent, values);
      updateAgent.mutate({ params: { id }, body });
    },
  });

  const [watchedName, watchedInstructions] = form.watch(["name", "instructions"]);
  const canSave =
    (watchedName ?? "").trim().length > 0 && (watchedInstructions ?? "").trim().length > 0;

  const watchedGates = form.watch("gates") ?? [];
  const watchedGateRuleIds = form.watch("gateRuleIds") ?? [];
  const setGates = (next: GateRuleInput[]) => form.setValue("gates", next, { shouldDirty: true });

  /** Save one own-rule from the rule editor (append for "new", replace by index). */
  const saveRule = (gate: GateRuleInput) => {
    setGates(
      editingRule === "new"
        ? [...watchedGates, gate]
        : watchedGates.map((g, i) => (i === editingRule ? gate : g)),
    );
    setEditingRule(null);
  };

  return renderForm(
    <ImmersivePage
      actions={
        <>
          <Button
            data-testid={AgentDetailScreenTestId.Run}
            icon="play"
            intent="ghost"
            onClick={() =>
              openNewTask(undefined, {
                kind: "agent",
                id: agent.id,
                name,
                glyph: "bot",
              })
            }
            size="sm"
          >
            {t("run")}
          </Button>
          <PinButton id={agent.id} kind="agent" />
          <Button
            data-testid={AgentDetailScreenTestId.Delete}
            icon="x"
            intent="danger"
            onClick={() => setConfirmDelete(true)}
            size="sm"
          >
            {t("delete")}
          </Button>
          <Button
            data-testid={AgentDetailScreenTestId.Save}
            disabled={!canSave}
            icon="check"
            intent="primary"
            loading={updateAgent.isPending}
            onClick={() => void submit()}
            size="sm"
          >
            {t("save")}
          </Button>
        </>
      }
      backHref="/agents"
      subtitle={agentFile(agent.id)}
      title={name}
    >
      <Container padding={["300", "350"]}>
        <PageContainer>
          <Stack gap="250">
            <EntityHero
              editable
              desc={agent.description}
              glyph={(agent.glyph as IconName | undefined) ?? "bot"}
              height={200}
              image={agent.avatar}
              name={name}
              onRemove={() =>
                updateAgent.mutate({ params: { id: agent.id }, body: { avatar: null } })
              }
              onUpload={(dataUri) => {
                if (dataUri.length > AVATAR_MAX) {
                  toastBus.emit({ message: t("avatarTooLarge") });
                  return;
                }
                updateAgent.mutate({ params: { id: agent.id }, body: { avatar: dataUri } });
              }}
              placeholder={t("uploadAgentAvatar")}
              removeLabel={t("removeImage")}
              uploadLabel={t("uploadImage")}
            />

            <HudPanel surface="glass" title={t("tabBasics")}>
              <AgentEditBasics categories={categories} control={form.control} />
            </HudPanel>

            <HudPanel surface="glass" title={t("tabRules")}>
              <AgentRulesSection
                agentName={watchedName || name}
                gateRuleIds={watchedGateRuleIds}
                gates={watchedGates}
                onAddRule={() => setEditingRule("new")}
                onDeleteRule={(i) => setGates(watchedGates.filter((_, j) => j !== i))}
                onEditRule={(i) => setEditingRule(i)}
                onLinkedChange={(ids) => form.setValue("gateRuleIds", ids, { shouldDirty: true })}
              />
            </HudPanel>

            <HudPanel surface="glass" title={t("usedInPipelines")}>
              {usedBy.length === 0 ? (
                <Typography size="sm" type="note" variant="tertiary">
                  {t("notInPipeline")}
                </Typography>
              ) : (
                <Stack wrap direction="row" gap="100">
                  {usedBy.map((p) => (
                    <Tag key={p.id} tone="accent">
                      {p.name ?? p.id} · {t("phaseCount", { count: p.phases.length })}
                    </Tag>
                  ))}
                </Stack>
              )}
            </HudPanel>
          </Stack>
        </PageContainer>
      </Container>

      {confirmDelete && (
        <ConfirmDeleteDialog
          body={t("deleteBody", { name, file: agentFile(agent.id) })}
          cancelLabel={tk("common.cancel")}
          confirmLabel={t("delete")}
          icon="x"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            deleteAgent.mutate(
              { params: { id: agent.id } },
              { onSuccess: () => router.push("/agents") },
            )
          }
          pending={deleteAgent.isPending}
          title={t("deleteTitle")}
        />
      )}

      {editingRule !== null && (
        <RuleModal
          initial={
            typeof editingRule === "number"
              ? ownRuleToInitial(watchedGates[editingRule]!)
              : undefined
          }
          onClose={() => setEditingRule(null)}
          onSave={(rule) =>
            saveRule({
              match: rule.match,
              decision: rule.decision,
              ...(rule.resolve ? { resolve: rule.resolve } : {}),
            })
          }
        />
      )}
    </ImmersivePage>,
  );
}
