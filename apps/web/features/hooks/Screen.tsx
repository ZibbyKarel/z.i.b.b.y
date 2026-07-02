"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Stack } from "@zibby/design-system";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Collection } from "../../components/Collection/Collection";
import { HookCard } from "./components/HookCard";
import { HookFormDialog } from "./components/HookFormDialog";
import { useHooksQuery } from "./queries";
import { useCreateHookMutation } from "./mutations";

export function Screen() {
  const t = useTranslations();
  const router = useRouter();
  const hooksQuery = useHooksQuery();
  const hooks = hooksQuery.data ?? [];
  const [creating, setCreating] = useState(false);

  const create = useCreateHookMutation();

  return (
    <PageContainer>
      <Stack gap="250">
        <PageHeader
          actions={
            <Button icon="plus" intent="primary" onClick={() => setCreating(true)}>
              {t("hooks.addHook")}
            </Button>
          }
          subtitle={t("hooks.countSummary", { count: hooks.length })}
          title={t("hooks.title")}
        />

        <Collection
          empty={{
            glyph: "checkpoint",
            title: t("hooks.emptyTitle"),
            description: t("hooks.emptyDescription"),
            actionLabel: t("hooks.addHook"),
            hint: t("hooks.emptyHint"),
            onAction: () => setCreating(true),
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
            // Grammar (N4e): Configure NAVIGATES to the detail page — no edit dialog.
            <HookCard hook={h} key={h.id} onConfigure={(hook) => router.push(`/hooks/${hook.id}`)} />
          )}
        />
      </Stack>

      {creating && (
        <HookFormDialog
          onClose={() => setCreating(false)}
          onCreate={(body) =>
            create.mutate(
              { body },
              {
                // The dialog only births the hook; editing lives on the detail page.
                onSuccess: () => {
                  setCreating(false);
                  router.push(`/hooks/${body.id}`);
                },
              },
            )
          }
        />
      )}
    </PageContainer>
  );
}
