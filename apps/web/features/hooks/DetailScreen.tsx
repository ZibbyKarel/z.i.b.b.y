"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Container, Stack } from "@zibby/design-system";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import type { Hook } from "@zibby/contracts";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { ImmersivePage } from "../../components/layout/ImmersivePage/ImmersivePage";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { HookFormFields, useHookFormState } from "./components/HookFormFields";
import { useDeleteHookMutation, useUpdateHookMutation } from "./mutations";
import { useHookQuery } from "./queries";

export enum HookDetailScreenTestId {
  Save = "hook-detail-save",
  Delete = "hook-detail-delete",
}

export interface HookDetailScreenProps {
  hookId: string;
}

/**
 * The `/hooks/:id` detail page (N4e, on the N4c template) — the card's
 * Configure action NAVIGATES here, the page IS the edit surface (the same
 * {@link HookFormFields} the create dialog renders, id locked) and Save/Delete
 * sit top-right; delete asks in a confirm dialog (it used to fire unconfirmed
 * from inside the edit dialog).
 */
export function DetailScreen({ hookId }: HookDetailScreenProps) {
  const query = useHookQuery(hookId);
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;
  if (query.isPending) return <QueryLoading />;
  if (!query.data) return null;
  // The form captures its defaults at mount — key by hook so a different id remounts.
  return <HookEditor hook={query.data} key={query.data.id} />;
}

function HookEditor({ hook }: { hook: Hook }) {
  const t = useTranslations();
  const router = useRouter();
  const updateHook = useUpdateHookMutation();
  const deleteHook = useDeleteHookMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const form = useHookFormState(hook);

  const name = hook.name ?? hook.id;
  const subtitle = hook.matcher ? `${hook.event} · ${hook.matcher}` : hook.event;

  return (
    <ImmersivePage
      actions={
        <>
          <Button
            data-testid={HookDetailScreenTestId.Delete}
            icon="trash"
            intent="danger"
            onClick={() => setConfirmDelete(true)}
            size="sm"
          >
            {t("common.delete")}
          </Button>
          <Button
            data-testid={HookDetailScreenTestId.Save}
            disabled={!form.canSave(false)}
            icon="check"
            intent="primary"
            loading={updateHook.isPending}
            onClick={() => updateHook.mutate({ params: { id: hook.id }, body: form.buildPatch() })}
            size="sm"
          >
            {t("common.save")}
          </Button>
        </>
      }
      backHref="/hooks"
      subtitle={subtitle}
      title={name}
    >
      <Container padding={["300", "350"]}>
        <PageContainer>
          <Stack gap="250">
            <HudPanel surface="glass" title={t("hooks.detailPanel")}>
              <HookFormFields idLocked form={form} />
            </HudPanel>
          </Stack>
        </PageContainer>
      </Container>

      {confirmDelete && (
        <ConfirmDeleteDialog
          body={t("hooks.deleteBody", { name })}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("common.delete")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            deleteHook.mutate(
              { params: { id: hook.id } },
              { onSuccess: () => router.push("/hooks") },
            )
          }
          pending={deleteHook.isPending}
          title={t("hooks.deleteTitle")}
        />
      )}
    </ImmersivePage>
  );
}
