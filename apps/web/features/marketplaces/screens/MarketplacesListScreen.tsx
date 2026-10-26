"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Button,
  Container,
  EmptyState,
  EntityCard,
  Grid,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { ConnectMarketplaceDialog } from "../components/ConnectMarketplaceDialog";
import { useMarketplacesQuery } from "../queries";

export enum MarketplacesListScreenTestId {
  Connect = "marketplaces-connect",
}

/** `/workforce/marketplaces` — connected Claude Code plugin marketplaces. */
export function MarketplacesListScreen() {
  const t = useTranslations("marketplaces");
  const router = useRouter();
  const query = useMarketplacesQuery();
  const [connecting, setConnecting] = useState(false);
  const marketplaces = query.data ?? [];

  const connectButton = (
    <Button
      data-testid={MarketplacesListScreenTestId.Connect}
      icon="plus"
      intent="primary"
      onClick={() => setConnecting(true)}
    >
      {t("connect")}
    </Button>
  );

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="baseline" direction="row" gap="150" justify="between">
          <Typography type="h1">{t("title")}</Typography>
          {connectButton}
        </Stack>

        <Typography size="sm" type="note" variant="secondary">
          {t("countSummary", { count: marketplaces.length })}
        </Typography>

        {query.isPending ? (
          <QueryLoading />
        ) : query.isError ? (
          <QueryError onRetry={() => void query.refetch()} />
        ) : marketplaces.length === 0 ? (
          <EmptyState action={connectButton} body={t("emptyDescription")} title={t("emptyTitle")} />
        ) : (
          <Grid cols={1} gap="150" lg={3} sm={2}>
            {marketplaces.map((m) => (
              <EntityCard
                badges={[
                  [
                    <Tag key="mode" tone={m.devMode ? "thinking" : "neutral"}>
                      {m.devMode ? t("devBadge") : t("normalBadge")}
                    </Tag>,
                  ],
                ]}
                description={t("installedOf", {
                  installed: m.installedCount,
                  total: m.pluginCount,
                })}
                glyph="grid"
                key={m.id}
                onClick={() => router.push(`/workforce/marketplaces/${m.id}` as Route)}
                openLabel={t("openAria", { name: m.id })}
                subtitle={m.source}
                title={m.id}
              />
            ))}
          </Grid>
        )}
      </Stack>

      {connecting && (
        <ConnectMarketplaceDialog
          onClose={() => setConnecting(false)}
          onConnected={(id) => router.push(`/workforce/marketplaces/${id}` as Route)}
        />
      )}
    </Container>
  );
}
