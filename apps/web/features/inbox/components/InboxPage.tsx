"use client";

import type { InboxItemsResponse, InboxSourceError } from "@zibby/contracts";
import { Button, Container, EmptyState, Stack } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { InboxBanners } from "./InboxBanners";
import { InboxFilterBar } from "./InboxFilterBar";
import { InboxHeader, type InboxView } from "./InboxHeader";

export enum InboxPageTestId {
  NoIntegrations = "inbox-no-integrations",
}

export interface InboxPageProps {
  view: InboxView;
  /** Items response — feeds the `Sync` button and the "no integrations" gate. */
  items: InboxItemsResponse | undefined;
  /** The query whose result the page body renders; it alone decides loading / error. */
  status: { isPending: boolean; isError: boolean; refetch: () => unknown };
  /** Per-integration failures from every response the page used (non-blocking). */
  errors: InboxSourceError[];
  children: ReactNode;
}

/**
 * The frame every Inbox list page shares: header (title + sync), then — once the
 * body query resolved — the filter bar, the per-integration banners and the body.
 * Loading, whole-request error and "no integrations" replace the body (spec "States").
 */
export function InboxPage({ view, items, status, errors, children }: InboxPageProps) {
  const t = useTranslations("inboxPage");
  const router = useRouter();
  const noIntegrations = !status.isPending && !status.isError && items?.syncProjectIds.length === 0;

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="250">
        <InboxHeader
          syncProjectIds={items?.syncProjectIds}
          syncedAt={items?.syncedAt}
          view={view}
        />
        {status.isPending ? (
          <QueryLoading />
        ) : status.isError ? (
          <QueryError onRetry={() => void status.refetch()} />
        ) : noIntegrations ? (
          <EmptyState
            action={
              <Button onClick={() => router.push("/projects" as Route)} size="sm">
                {t("noIntegrations.action")}
              </Button>
            }
            body={t("noIntegrations.body")}
            data-testid={InboxPageTestId.NoIntegrations}
            title={t("noIntegrations.title")}
          />
        ) : (
          <>
            <InboxFilterBar />
            <InboxBanners errors={errors} />
            {children}
          </>
        )}
      </Stack>
    </Container>
  );
}
