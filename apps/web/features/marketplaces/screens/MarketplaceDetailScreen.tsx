"use client";

import type { Route } from "next";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Container,
  Stack,
  type SubNavLinkComponent,
  Tag,
  Typography,
} from "@zibby/design-system";
import type { MarketplaceDetail } from "@zibby/contracts";
import { ConfirmDeleteDialog } from "../../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { PageBreadcrumb } from "../../../components/layout/PageBreadcrumb";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { apiErrorMessage } from "../../../state/apiErrorMessage";
import { MarketplacePluginPanel } from "../components/MarketplacePluginPanel";
import {
  useInstallAllPluginsMutation,
  useInstallPluginMutation,
  useRemoveMarketplaceMutation,
  useUninstallPluginMutation,
  useUpdateMarketplaceMutation,
} from "../mutations";
import { useMarketplaceQuery } from "../queries";

export enum MarketplaceDetailScreenTestId {
  Update = "marketplace-detail-update",
  InstallAll = "marketplace-detail-install-all",
  Remove = "marketplace-detail-remove",
  Mode = "marketplace-detail-mode",
  Source = "marketplace-detail-source",
  Error = "marketplace-detail-error",
}

export interface MarketplaceDetailScreenProps {
  marketplaceId: string;
}

/** `/workforce/marketplaces/:id` — plugins of one marketplace with install controls. */
export function MarketplaceDetailScreen({ marketplaceId }: MarketplaceDetailScreenProps) {
  const query = useMarketplaceQuery(marketplaceId);
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;
  if (query.isPending) return <QueryLoading />;
  if (!query.data) return null;
  return <MarketplaceDetail marketplace={query.data} />;
}

function MarketplaceDetail({ marketplace }: { marketplace: MarketplaceDetail }) {
  const t = useTranslations("marketplaces");
  const tc = useTranslations("common");
  const router = useRouter();
  const update = useUpdateMarketplaceMutation();
  const installAll = useInstallAllPluginsMutation();
  const install = useInstallPluginMutation();
  const uninstall = useUninstallPluginMutation();
  const remove = useRemoveMarketplaceMutation();
  const [confirmRemove, setConfirmRemove] = useState(false);
  // The alert reflects only the most recently started action, never a stale failure.
  const mutations = { update, installAll, install, uninstall, remove };
  const [last, setLast] = useState<keyof typeof mutations>();

  const id = marketplace.id;
  const busy =
    update.isPending ||
    installAll.isPending ||
    install.isPending ||
    uninstall.isPending ||
    remove.isPending;
  const lastMutation = last ? mutations[last] : undefined;
  const failure = lastMutation?.isError ? lastMutation.error : undefined;

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <PageBreadcrumb
            items={[
              { label: t("breadcrumb"), href: "/workforce/marketplaces" as Route },
              { label: id },
            ]}
            linkComponent={Link as SubNavLinkComponent}
          />

          <Stack wrap align="center" direction="row" gap="150" justify="between">
            <Stack gap="50">
              <Stack align="center" direction="row" gap="100">
                <Typography type="h1">{id}</Typography>
                <Tag
                  data-testid={MarketplaceDetailScreenTestId.Mode}
                  tone={marketplace.devMode ? "thinking" : "neutral"}
                >
                  {marketplace.devMode ? t("modeDev") : t("modeNormal")}
                </Tag>
              </Stack>
              <Typography
                mono
                data-testid={MarketplaceDetailScreenTestId.Source}
                size="sm"
                type="note"
                variant="secondary"
              >
                {marketplace.source}
              </Typography>
            </Stack>
            <Stack align="center" direction="row" gap="100">
              <Button
                data-testid={MarketplaceDetailScreenTestId.Update}
                disabled={busy}
                icon="retry"
                intent="secondary"
                loading={update.isPending}
                onClick={() => {
                  setLast("update");
                  update.mutate({ params: { id } });
                }}
                size="sm"
              >
                {t("update")}
              </Button>
              <Button
                data-testid={MarketplaceDetailScreenTestId.InstallAll}
                disabled={busy}
                icon="plus"
                intent="secondary"
                loading={installAll.isPending}
                onClick={() => {
                  setLast("installAll");
                  installAll.mutate({ params: { id } });
                }}
                size="sm"
              >
                {t("installAll")}
              </Button>
              <Button
                data-testid={MarketplaceDetailScreenTestId.Remove}
                disabled={busy}
                icon="trash"
                intent="danger"
                onClick={() => setConfirmRemove(true)}
                size="sm"
              >
                {t("remove")}
              </Button>
            </Stack>
          </Stack>

          {failure !== undefined && (
            <Alert data-testid={MarketplaceDetailScreenTestId.Error} severity="error">
              {apiErrorMessage(failure) ?? t("actionFailed")}
            </Alert>
          )}

          {marketplace.plugins.length === 0 ? (
            <Typography size="sm" type="note" variant="secondary">
              {t("noPlugins")}
            </Typography>
          ) : (
            marketplace.plugins.map((plugin) => (
              <MarketplacePluginPanel
                key={plugin.name}
                onInstall={(name) => {
                  setLast("install");
                  install.mutate({ params: { id, plugin: name } });
                }}
                onUninstall={(name) => {
                  setLast("uninstall");
                  uninstall.mutate({ params: { id, plugin: name } });
                }}
                pending={busy}
                plugin={plugin}
              />
            ))
          )}
        </Stack>
      </PageContainer>

      {confirmRemove && (
        <ConfirmDeleteDialog
          body={t("removeBody", { name: id })}
          cancelLabel={tc("cancel")}
          confirmLabel={t("remove")}
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => {
            setLast("remove");
            remove.mutate(
              { params: { id } },
              { onSuccess: () => router.push("/workforce/marketplaces" as Route) },
            );
          }}
          pending={remove.isPending}
          title={t("removeTitle")}
        />
      )}
    </Container>
  );
}
