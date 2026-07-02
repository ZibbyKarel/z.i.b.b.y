"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Stack } from "@zibby/design-system";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Collection } from "../../components/Collection/Collection";
import { McpServerCard } from "./components/McpServerCard";
import { type McpServerCreateDraft, McpServerFormDialog } from "./components/McpServerFormDialog";
import { useMcpServersQuery } from "./queries";
import { useCreateMcpServerMutation, useSetMcpCredentialsMutation } from "./mutations";

export function Screen() {
  const t = useTranslations();
  const router = useRouter();
  const serversQuery = useMcpServersQuery();
  const servers = serversQuery.data ?? [];
  const [creating, setCreating] = useState(false);

  const create = useCreateMcpServerMutation();
  const setCredentials = useSetMcpCredentialsMutation();

  const onCreate = ({ create: body, authToken }: McpServerCreateDraft) => {
    create.mutate(
      { body },
      {
        onSuccess: () => {
          // The token rides out-of-band — persisted through the SEPARATE
          // credentials endpoint, never inside the stored config.
          if (authToken) {
            setCredentials.mutate({ params: { id: body.id }, body: { authToken } });
          }
          setCreating(false);
          // The dialog only births the server; editing lives on the detail page.
          router.push(`/mcp/${body.id}`);
        },
      },
    );
  };

  return (
    <PageContainer>
      <Stack gap="250">
        <PageHeader
          actions={
            <Button icon="plus" intent="primary" onClick={() => setCreating(true)}>
              {t("mcp.addServer")}
            </Button>
          }
          subtitle={t("mcp.countSummary", { count: servers.length })}
          title={t("mcp.title")}
        />

        <Collection
          empty={{
            glyph: "server",
            title: t("mcp.emptyTitle"),
            description: t("mcp.emptyDescription"),
            actionLabel: t("mcp.addServer"),
            hint: t("mcp.emptyHint"),
            onAction: () => setCreating(true),
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
            // Grammar (N4e): Configure NAVIGATES to the detail page — no edit dialog.
            <McpServerCard
              key={s.id}
              onConfigure={(server) => router.push(`/mcp/${server.id}`)}
              server={s}
            />
          )}
        />
      </Stack>

      {creating && <McpServerFormDialog onClose={() => setCreating(false)} onCreate={onCreate} />}
    </PageContainer>
  );
}
