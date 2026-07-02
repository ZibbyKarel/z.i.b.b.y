"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Dialog, Stack, Typography } from "@zibby/design-system";
import type { McpServer } from "@zibby/contracts";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { McpServerFormFields, useMcpFormState } from "./components/McpServerFormFields";
import {
  useDeleteMcpServerMutation,
  useSetMcpCredentialsMutation,
  useUpdateMcpServerMutation,
} from "./mutations";
import { useMcpServerQuery } from "./queries";

export enum McpDetailScreenTestId {
  Save = "mcp-detail-save",
  Delete = "mcp-detail-delete",
}

export interface McpDetailScreenProps {
  serverId: string;
}

/**
 * The `/mcp/:id` detail page (N4e, on the N4c template) — the card's Configure
 * action NAVIGATES here, the page IS the edit surface (the same
 * {@link McpServerFormFields} the create dialog renders; id + transport locked)
 * and Save/Delete sit top-right; delete asks in a confirm dialog (it used to
 * fire unconfirmed from inside the edit dialog). A freshly entered auth token
 * still rides out-of-band through the separate credentials mutation.
 */
export function DetailScreen({ serverId }: McpDetailScreenProps) {
  const query = useMcpServerQuery(serverId);
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;
  if (query.isPending) return <QueryLoading />;
  if (!query.data) return null;
  // The form captures its defaults at mount — key by server so a different id remounts.
  return <McpServerEditor key={query.data.id} server={query.data} />;
}

function McpServerEditor({ server }: { server: McpServer }) {
  const t = useTranslations();
  const router = useRouter();
  const updateServer = useUpdateMcpServerMutation();
  const deleteServer = useDeleteMcpServerMutation();
  const setCredentials = useSetMcpCredentialsMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const form = useMcpFormState(server);

  const name = server.name ?? server.id;

  const save = () => {
    updateServer.mutate(
      { params: { id: server.id }, body: form.buildPatch() },
      {
        onSuccess: () => {
          const token = form.newAuthToken();
          if (token) setCredentials.mutate({ params: { id: server.id }, body: { authToken: token } });
        },
      },
    );
  };

  return (
    <PageContainer>
      <Stack gap="250">
        <PageHeader
          actions={
            <>
              <Button
                data-testid={McpDetailScreenTestId.Delete}
                icon="trash"
                intent="danger"
                onClick={() => setConfirmDelete(true)}
                size="sm"
              >
                {t("common.delete")}
              </Button>
              <Button
                data-testid={McpDetailScreenTestId.Save}
                disabled={!form.canSave(false)}
                icon="check"
                intent="primary"
                loading={updateServer.isPending}
                onClick={save}
                size="sm"
              >
                {t("common.save")}
              </Button>
              <Button intent="ghost" onClick={() => router.push("/mcp")} size="sm">
                {t("common.back")}
              </Button>
            </>
          }
          subtitle={server.type === "stdio" ? server.command : server.url}
          title={name}
        />

        <HudPanel title={t("mcp.detailPanel")}>
          <McpServerFormFields idLocked form={form} hasCredentials={server.hasCredentials} />
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
                loading={deleteServer.isPending}
                onClick={() =>
                  deleteServer.mutate(
                    { params: { id: server.id } },
                    { onSuccess: () => router.push("/mcp") },
                  )
                }
              >
                {t("common.delete")}
              </Button>
            </>
          }
          onClose={() => setConfirmDelete(false)}
          title={t("mcp.deleteTitle")}
          width="sm"
        >
          <Typography size="base" type="note" variant="secondary">
            {t("mcp.deleteBody", { name })}
          </Typography>
        </Dialog>
      )}
    </PageContainer>
  );
}
