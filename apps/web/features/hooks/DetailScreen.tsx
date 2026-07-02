"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Dialog, Stack, Typography } from "@zibby/design-system";
import type { Hook } from "@zibby/contracts";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
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
    <PageContainer>
      <Stack gap="250">
        <PageHeader
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
                onClick={() =>
                  updateHook.mutate({ params: { id: hook.id }, body: form.buildPatch() })
                }
                size="sm"
              >
                {t("common.save")}
              </Button>
              <Button intent="ghost" onClick={() => router.push("/hooks")} size="sm">
                {t("common.back")}
              </Button>
            </>
          }
          subtitle={subtitle}
          title={name}
        />

        <HudPanel title={t("hooks.detailPanel")}>
          <HookFormFields idLocked form={form} />
        </HudPanel>
      </Stack>

      {confirmDelete && (
        <Dialog
          open
          actions={
            <>
              <Button intent="ghost" onClick={() => setConfirmDelete(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                icon="trash"
                intent="danger"
                loading={deleteHook.isPending}
                onClick={() =>
                  deleteHook.mutate(
                    { params: { id: hook.id } },
                    { onSuccess: () => router.push("/hooks") },
                  )
                }
              >
                {t("common.delete")}
              </Button>
            </>
          }
          onClose={() => setConfirmDelete(false)}
          title={t("hooks.deleteTitle")}
          width="sm"
        >
          <Typography size="base" type="note" variant="secondary">
            {t("hooks.deleteBody", { name })}
          </Typography>
        </Dialog>
      )}
    </PageContainer>
  );
}
