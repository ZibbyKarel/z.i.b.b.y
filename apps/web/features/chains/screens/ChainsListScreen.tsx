"use client";

import type { Chain } from "@zibby/contracts";
import {
  Button,
  ChainRouteStrip,
  Container,
  DataTable,
  type DataTableColumn,
  EmptyState,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { chainRouteGates, chainRouteSteps } from "../chainRoute";
import { useChainsQuery } from "../queries";

/**
 * `/work/chains` — ZB-05b: the chain library. A `DataTable` over
 * `GET /api/handoff/chains` (name, a chip-size `ChainRouteStrip` of its route,
 * enabled, in-flight count). Row click goes to the read/edit detail.
 *
 * In-flight count is deliberately NOT shown per-row: `GET /api/tasks/parents`
 * has no chain filter and a parent task carries no `target`/chain field to
 * derive it from client-side either (only a SUBTASK carries `chain: {id,
 * step}`) — showing a fabricated or wrong count would be worse than "—"
 * (PART-B's explicit fallback for this deliverable).
 */
export function ChainsListScreen() {
  const t = useTranslations("chainsWork");
  const router = useRouter();
  const { data: chains = [], isPending, isError, refetch } = useChainsQuery();

  const columns: DataTableColumn<Chain>[] = [
    {
      key: "label",
      label: t("list.column.name"),
      width: "lg",
      render: (row) => (
        <Stack gap="25">
          <Typography type="note">{row.label}</Typography>
          <Typography mono size="2xs" type="note" variant="tertiary">
            {row.id}
          </Typography>
        </Stack>
      ),
    },
    {
      key: "route",
      label: t("list.column.route"),
      width: "flex",
      render: (row) => (
        <ChainRouteStrip gates={chainRouteGates(row)} size="chip" steps={chainRouteSteps(row)} />
      ),
    },
    {
      key: "enabled",
      label: t("list.column.enabled"),
      width: "sm",
      render: (row) => (
        <Tag tone={row.enabled ? "done" : "neutral"}>
          {row.enabled ? t("list.enabledYes") : t("list.enabledNo")}
        </Tag>
      ),
    },
    {
      key: "inFlight",
      label: t("list.column.inFlight"),
      width: "xs",
      align: "right",
      render: () => (
        <Typography size="sm" type="note" variant="tertiary">
          —
        </Typography>
      ),
    },
  ];

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="baseline" direction="row" gap="150" justify="between">
          <Stack gap="50">
            <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
              {t("eyebrow")}
            </Typography>
            <Typography type="h1">{t("list.title")}</Typography>
          </Stack>
          <Button
            icon="plus"
            intent="primary"
            onClick={() => router.push("/work/chains/new" as Route)}
            size="sm"
          >
            {t("list.newAction")}
          </Button>
        </Stack>

        {isPending ? (
          <QueryLoading />
        ) : isError ? (
          <QueryError onRetry={() => void refetch()} />
        ) : (
          <DataTable
            columns={columns}
            empty={<EmptyState body={t("list.emptyBody")} title={t("list.emptyTitle")} />}
            getRowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/work/chains/${row.id}` as Route)}
            rows={chains}
          />
        )}
      </Stack>
    </Container>
  );
}
