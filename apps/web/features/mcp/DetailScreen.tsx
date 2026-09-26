"use client";

import type { Route } from "next";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Breadcrumb,
  Button,
  Container,
  Panel,
  Stack,
  type SubNavLinkComponent,
  Typography,
} from "@zibby/design-system";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import type { McpServer } from "@zibby/contracts";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
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
          if (token)
            setCredentials.mutate({ params: { id: server.id }, body: { authToken: token } });
        },
      },
    );
  };

  const subtitle = server.type === "stdio" ? server.command : server.url;

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Breadcrumb
            items={[
              { label: t("registries.title"), href: "/system/registries/mcp" as Route },
              { label: name },
            ]}
            linkComponent={Link as SubNavLinkComponent}
          />

          <Stack wrap align="center" direction="row" gap="150" justify="between">
            <Stack gap="25">
              <Typography type="h1">{name}</Typography>
              {subtitle && (
                <Typography mono size="xs" type="note" variant="tertiary">
                  {subtitle}
                </Typography>
              )}
            </Stack>
            <Stack align="center" direction="row" gap="100">
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
            </Stack>
          </Stack>

          <Panel header={t("mcp.detailPanel")} padding="200">
            <McpServerFormFields idLocked form={form} hasCredentials={server.hasCredentials} />
          </Panel>
        </Stack>
      </PageContainer>

      {confirmDelete && (
        <ConfirmDeleteDialog
          body={t("mcp.deleteBody", { name })}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("common.delete")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            deleteServer.mutate(
              { params: { id: server.id } },
              { onSuccess: () => router.push("/system/registries/mcp") },
            )
          }
          pending={deleteServer.isPending}
          title={t("mcp.deleteTitle")}
        />
      )}
    </Container>
  );
}
