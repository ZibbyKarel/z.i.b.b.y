"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Hook } from "@zibby/contracts";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { SectionToolbar } from "../../components/SectionToolbar/SectionToolbar";
import { Collection } from "../../components/Collection/Collection";
import { HookCard } from "./components/HookCard";
import { type HookDraft, HookFormDialog } from "./components/HookFormDialog";
import { useHooksQuery } from "./queries";
import {
  useCreateHookMutation,
  useDeleteHookMutation,
  useUpdateHookMutation,
} from "./mutations";

/** Which hook the form dialog is open for: "new", an entity, or closed. */
type Editing = "new" | Hook | null;

export function Screen() {
  const t = useTranslations();
  const hooksQuery = useHooksQuery();
  const hooks = hooksQuery.data ?? [];
  const [editing, setEditing] = useState<Editing>(null);

  const create = useCreateHookMutation();
  const update = useUpdateHookMutation();
  const remove = useDeleteHookMutation();

  const onSubmit = (draft: HookDraft) => {
    if (draft.create) {
      create.mutate({ body: draft.create });
    } else if (draft.update) {
      const { id, patch } = draft.update;
      update.mutate({ params: { id }, body: patch });
    }
    setEditing(null);
  };

  return (
    <PageContainer>
      <SectionToolbar
        addLabel={t("hooks.addHook")}
        label={t("hooks.sectionLabel")}
        onAdd={() => setEditing("new")}
      />

      <Collection
        empty={{
          glyph: "checkpoint",
          title: t("hooks.emptyTitle"),
          description: t("hooks.emptyDescription"),
          actionLabel: t("hooks.addHook"),
          hint: t("hooks.emptyHint"),
          onAction: () => setEditing("new"),
        }}
        error={
          hooksQuery.isError
            ? {
                title: t("common.loadErrorTitle"),
                description: t("common.loadErrorDescription"),
                retryLabel: t("common.retry"),
                onRetry: () => void hooksQuery.refetch(),
              }
            : undefined
        }
        items={hooks}
        loading={hooksQuery.isPending ? { label: t("common.loading") } : undefined}
        renderItem={(h) => (
          <HookCard hook={h} key={h.id} onConfigure={(hook) => setEditing(hook)} />
        )}
      />

      {editing !== null && (
        <HookFormDialog
          hook={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onDelete={
            editing === "new"
              ? undefined
              : () => {
                  remove.mutate({ params: { id: editing.id } });
                  setEditing(null);
                }
          }
          onSubmit={onSubmit}
        />
      )}
    </PageContainer>
  );
}
