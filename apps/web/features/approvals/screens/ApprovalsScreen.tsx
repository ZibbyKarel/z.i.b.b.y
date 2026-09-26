"use client";

import {
  ApprovalCard,
  Container,
  DataTable,
  type DataTableColumn,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { type DashboardApproval, HIGH_RISK_TYPES, formatWaited } from "../approval";
import { useApproveMutation, useRejectMutation } from "../mutations";
import { useApprovalHistoryQuery, useApprovalsQuery } from "../queries";

/** `/policy/approvals` — the queue (as row-density `ApprovalCard`s) and the
 * decided history, both `DataTable`s. The detail/decision surface itself is
 * the shell-level `?approval=` sheet (`ApprovalSheet`) — a row's "Open" (or a
 * click on history) sets that search param rather than navigating away. */
export function ApprovalsScreen() {
  const t = useTranslations("policy.approvals");
  const router = useRouter();
  const pathname = usePathname();
  const { data: queue, isPending, isError, refetch } = useApprovalsQuery();
  const history = useApprovalHistoryQuery();
  const approve = useApproveMutation();
  const reject = useRejectMutation();

  const openSheet = (id: string) => router.push(`${pathname}?approval=${id}` as Route);

  const queueColumns: DataTableColumn<DashboardApproval>[] = [
    {
      key: "row",
      label: t("queueTitle"),
      width: "flex",
      render: (a) => (
        <ApprovalCard
          agentName={a.skill}
          density="row"
          glyphSeed={a.skill}
          highRisk={a.riskType != null && HIGH_RISK_TYPES.has(a.riskType)}
          meta={a.kind}
          onApprove={() => approve.mutate({ params: { id: a.id }, body: {} })}
          onDeny={() => reject.mutate({ params: { id: a.id }, body: {} })}
          onOpen={() => openSheet(a.id)}
          request={a.text ?? a.detail}
          taskRef={a.runId}
          waited={formatWaited(a.requestedAt)}
        />
      ),
    },
  ];

  const historyColumns: DataTableColumn<DashboardApproval>[] = [
    { key: "id", label: t("columns.id"), width: "sm", render: (a) => a.id.slice(-6) },
    {
      key: "decision",
      label: t("columns.decision"),
      width: "sm",
      render: (a) => (
        <Tag uppercase tone={a.status === "rejected" ? "bad" : "ok"}>
          {t(`decision.${a.status === "rejected" ? "rejected" : "approved"}`)}
        </Tag>
      ),
    },
    { key: "kind", label: t("columns.kind"), width: "sm" },
    {
      key: "request",
      label: t("columns.request"),
      width: "flex",
      render: (a) => a.text ?? a.detail,
    },
    {
      key: "department",
      label: t("columns.department"),
      width: "sm",
      render: (a) => a.department ?? "—",
    },
    { key: "task", label: t("columns.task"), width: "md", render: (a) => a.runId },
    {
      key: "when",
      label: t("columns.when"),
      width: "sm",
      render: (a) => (a.decidedAt ? formatWaited(a.decidedAt) : "—"),
    },
  ];

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="baseline" direction="row" gap="150">
          <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
            {t("title")}
          </Typography>
          <Typography type="h1">{t("queueTitle")}</Typography>
        </Stack>

        {isPending ? (
          <QueryLoading />
        ) : isError ? (
          <QueryError onRetry={() => void refetch()} />
        ) : (
          <DataTable
            columns={queueColumns}
            empty={t("queueEmpty")}
            getRowKey={(a) => a.id}
            rows={queue ?? []}
          />
        )}

        <Typography type="h2">{t("historyTitle")}</Typography>
        <DataTable
          columns={historyColumns}
          empty="—"
          getRowKey={(a) => a.id}
          loading={history.isPending}
          onRowClick={(a) => openSheet(a.id)}
          rows={history.data ?? []}
        />
      </Stack>
    </Container>
  );
}
