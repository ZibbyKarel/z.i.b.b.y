"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { McpServer } from "@zibby/contracts";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { SectionToolbar } from "../../components/SectionToolbar/SectionToolbar";
import { Collection } from "../../components/Collection/Collection";
import { McpServerCard } from "./components/McpServerCard";
import { type McpServerDraft, McpServerFormDialog } from "./components/McpServerFormDialog";
import { useMcpServersQuery } from "./queries";
import {
  useCreateMcpServerMutation,
  useDeleteMcpServerMutation,
  useSetMcpCredentialsMutation,
  useUpdateMcpServerMutation,
} from "./mutations";

/** Which server the form dialog is open for: "new", an entity, or closed. */
type Editing = "new" | McpServer | null;

export function Screen() {
  const t = useTranslations();
  const serversQuery = useMcpServersQuery();
  const servers = serversQuery.data ?? [];
  const [editing, setEditing] = useState<Editing>(null);

  const create = useCreateMcpServerMutation();
  const update = useUpdateMcpServerMutation();
  const remove = useDeleteMcpServerMutation();
  const setCredentials = useSetMcpCredentialsMutation();

  /** Persist a freshly entered auth token (if any) for a server. */
  const persistToken = (id: string, token: string | undefined) => {
    if (!token) return;
    setCredentials.mutate({ params: { id }, body: { authToken: token } });
  };

  const onSubmit = (draft: McpServerDraft) => {
    if (draft.create) {
      const { id } = draft.create;
      create.mutate(
        { body: draft.create },
        { onSuccess: () => persistToken(id, draft.authToken) },
      );
    } else if (draft.update) {
      const { id, patch } = draft.update;
      update.mutate(
        { params: { id }, body: patch },
        { onSuccess: () => persistToken(id, draft.authToken) },
      );
    }
    setEditing(null);
  };

  return (
    <PageContainer>
      <SectionToolbar
        addLabel={t("mcp.addServer")}
        label={t("mcp.sectionLabel")}
        onAdd={() => setEditing("new")}
      />

      <Collection
        empty={{
          glyph: "server",
          title: t("mcp.emptyTitle"),
          description: t("mcp.emptyDescription"),
          actionLabel: t("mcp.addServer"),
          hint: t("mcp.emptyHint"),
          onAction: () => setEditing("new"),
        }}
        error={
          serversQuery.isError
            ? {
                title: t("common.loadErrorTitle"),
                description: t("common.loadErrorDescription"),
                retryLabel: t("common.retry"),
                onRetry: () => void serversQuery.refetch(),
              }
            : undefined
        }
        items={servers}
        loading={serversQuery.isPending ? { label: t("common.loading") } : undefined}
        renderItem={(s) => (
          <McpServerCard key={s.id} onConfigure={(server) => setEditing(server)} server={s} />
        )}
      />

      {editing !== null && (
        <McpServerFormDialog
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
          server={editing === "new" ? undefined : editing}
        />
      )}
    </PageContainer>
  );
}
