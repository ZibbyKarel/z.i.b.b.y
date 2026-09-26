"use client";

import {
  Button,
  ChainRouteStrip,
  type ChainRouteStripStep,
  DiffView,
  type DiffHunk as DsDiffHunk,
  MetricStrip,
  Row,
  Sheet,
  Stack,
  Tag,
  TextAreaField,
  Typography,
} from "@zibby/design-system";
import { DEPARTMENTS } from "@zibby/contracts";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useTaskQuery } from "../../tasks/queries";
import { HIGH_RISK_TYPES, formatWaited, riskMeta } from "../approval";
import { useApproveMutation, useRejectMutation } from "../mutations";
import { useApprovalQuery } from "../queries";

/** Maps this feature's `DiffHunk` (approval.ts) into the DS `DiffView`'s own shape. */
function toDsHunks(hunks: { h: string; lines: [kind: "add" | "del" | "ctx", text: string][] }[]) {
  const kindMap = { add: "add", del: "remove", ctx: "context" } as const;
  return hunks.map(
    (hunk): DsDiffHunk => ({
      header: hunk.h,
      lines: hunk.lines.map(([kind, text]) => ({ type: kindMap[kind], text })),
    }),
  );
}

/**
 * `?approval=<id>` — the shell-level approval sheet (ZB-08), mounted once in
 * `AppShell` and driven purely by the search param so the rail's "→" and any
 * other deep link can open it over any page. Single-click approve everywhere
 * (D-014/O-13 overrides the spec's HoldButton-if-high-risk) — `highRisk` is
 * shown only as a `Tag` marker.
 */
export function ApprovalSheet({
  approvalId,
  onClose,
}: {
  approvalId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("policy.approvals.sheet");
  const router = useRouter();
  const { data: approval, isPending, isError, refetch } = useApprovalQuery(approvalId);
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const [reason, setReason] = useState("");
  const [denying, setDenying] = useState(false);

  // Best-effort parent chain: most gated runs ARE (or belong to) a task, whose
  // `subtasks` — when present — are this approval's chain route. A non-task
  // `runId` (e.g. a bare pipeline run) 404s quietly and the strip is omitted.
  const taskQuery = useTaskQuery(approval?.runId ?? "");
  const task = taskQuery.data;
  const steps: ChainRouteStripStep[] =
    task?.subtasks.map((s) => ({
      code: (s.department ?? "?").toUpperCase(),
      name: s.department
        ? (DEPARTMENTS.find((d) => d.id === s.department)?.name ?? s.department)
        : "",
      state: s.state,
    })) ?? [];

  const close = () => {
    setReason("");
    setDenying(false);
    onClose();
  };

  const body = !approvalId ? null : isPending ? (
    <QueryLoading />
  ) : isError || !approval ? (
    <QueryError onRetry={() => void refetch()} />
  ) : (
    <Stack gap="250">
      <Stack gap="100">
        <Row gap="100">
          <Tag tone="neutral">{approval.kind}</Tag>
          {approval.riskType && HIGH_RISK_TYPES.has(approval.riskType) && (
            <Tag uppercase icon="warn" tone="blocked">
              {t("highRisk")}
            </Tag>
          )}
        </Row>
        <Typography type="h3">{approval.text ?? approval.detail}</Typography>
        <Typography type="note" variant="tertiary">
          {approval.skill} · {t("waited", { waited: formatWaited(approval.requestedAt) })}
        </Typography>
      </Stack>

      <MetricStrip
        columns={3}
        items={[
          { label: t("metric.action"), value: approval.action },
          {
            label: t("metric.severity"),
            value: riskMeta(approval.riskType).label,
          },
          { label: t("metric.department"), value: approval.department ?? "—" },
        ]}
      />

      {approval.preview?.kind === "diff" && (
        <DiffView
          hunks={toDsHunks(approval.preview.hunks)}
          stat={{
            files: 1,
            additions: approval.preview.hunks.flatMap((h) => h.lines).filter((l) => l[0] === "add")
              .length,
            deletions: approval.preview.hunks.flatMap((h) => h.lines).filter((l) => l[0] === "del")
              .length,
          }}
        />
      )}

      {steps.length > 0 && (
        <Stack gap="100">
          <Typography tracking="wider" type="labelSm" variant="tertiary">
            {t("chainTitle")}
          </Typography>
          <ChainRouteStrip size="compact" steps={steps} />
        </Stack>
      )}

      {denying && (
        <TextAreaField
          hint={t("reasonHint")}
          label={t("reasonLabel")}
          onChange={(e) => setReason(e.target.value)}
          value={reason}
        />
      )}
    </Stack>
  );

  const footer = !approval ? null : denying ? (
    <Row gap="100">
      <Button
        block
        intent="secondary"
        onClick={() => {
          setDenying(false);
          setReason("");
        }}
      >
        {t("cancel")}
      </Button>
      <Button
        block
        intent="primary"
        loading={reject.isPending}
        onClick={() =>
          reject.mutate(
            { params: { id: approval.id }, body: reason ? { reason } : {} },
            { onSuccess: close },
          )
        }
      >
        {t("confirmDeny")}
      </Button>
    </Row>
  ) : (
    <Row gap="100">
      <Button
        block
        intent="primary"
        loading={approve.isPending}
        onClick={() =>
          approve.mutate({ params: { id: approval.id }, body: {} }, { onSuccess: close })
        }
      >
        {t("approve")}
      </Button>
      <Button block intent="secondary" onClick={() => setDenying(true)}>
        {t("deny")}
      </Button>
      <Button
        intent="ghost"
        onClick={() => {
          router.push(`/work/tasks/${approval.runId}`);
          close();
        }}
      >
        {t("openTask")}
      </Button>
    </Row>
  );

  return (
    <Sheet
      footer={footer}
      onClose={close}
      open={Boolean(approvalId)}
      title={approval ? approval.skill : t("title")}
      width="lg"
    >
      {body}
    </Sheet>
  );
}
