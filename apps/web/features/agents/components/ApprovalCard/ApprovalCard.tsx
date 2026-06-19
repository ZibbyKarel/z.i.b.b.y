import {
  Alert,
  Button,
  Card,
  Container,
  HoldButton,
  type RiskKind,
  Stack,
  StatusDot,
  Tag,
  Typography,
  riskIcon,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Approval } from "../../../../domain";

export interface ApprovalCardProps {
  /**
   * Domain approval; an enriched backend payload may add a semantic `riskType`
   * and carries the contract `kind` (agent/channel/…) the card keys its testid on.
   */
  approval: Approval & { riskType?: string; kind?: string };
  onApprove?: (approval: Approval) => void;
  onReject?: (approval: Approval) => void;
}

/** Domain risk tag (Czech) → DS risk kind. Unknown tags fall back to a chip. */
const riskKind: Record<string, RiskKind> = {
  platba: "payment",
  mazani: "deletion",
  mazání: "deletion",
  push: "push",
  odeslani: "send",
  odeslání: "send",
};

/** High-risk categories require the hold-to-confirm guardrail. */
const highRisk: ReadonlySet<RiskKind> = new Set(["payment", "deletion"]);

/**
 * Guardrail card (design `ZtApproval`, rail density): ZIBBY never clicks
 * "order / pay" itself. The card lives in the amber "waiting for you" state;
 * high-risk actions (payment, deletion) confirm via a 0.9s hold.
 */
export function ApprovalCard({ approval, onApprove, onReject }: ApprovalCardProps) {
  const t = useTranslations("approval");
  const [done, setDone] = useState<"ok" | "no" | null>(null);

  // Prefer the semantic risk type (platba/mazani/…); `risk` itself may carry
  // either a type tag (mock data) or a severity (low/medium/high) — severities
  // simply don't match the map and fall back to the plain chip + button.
  const kind = riskKind[approval.riskType ?? approval.risk];
  const hold = kind !== undefined && highRisk.has(kind);

  return (
    <Card
      corners
      // Stable, kind-scoped root testid so the approvals queue (which mixes agent
      // and channel cards) can be targeted deterministically — text-content
      // filtering is fragile because the action label and the Approve button live
      // in sibling sub-trees. Overrides Card's generic `card-root`.
      data-testid={approval.kind ? `approval-card-${approval.kind}` : "approval-card"}
      tone="warn"
    >
      <Container padding="200">
        <Stack gap="150">
          <Stack align="center" direction="row" gap="100" justify="between">
            <Stack align="center" direction="row" gap="100">
              <StatusDot pulse={!done} tone={done ? (done === "ok" ? "ok" : "idle") : "wait"} />
              <Typography
                mono
                uppercase
                size="sm"
                tone={done ? undefined : "warn"}
                tracking="widest"
                type="note"
                variant={done ? "tertiary" : undefined}
                weight="semibold"
              >
                {t("waiting")}
              </Typography>
            </Stack>
            {kind ? (
              <Tag icon={riskIcon[kind]} tone={kind}>
                {t(`riskTag.${kind}`)}
              </Tag>
            ) : (
              <Tag tone="neutral">{approval.risk}</Tag>
            )}
          </Stack>

          <Stack gap="25">
            <Typography size="md" type="note" weight="semibold">
              <Typography mono as="span" size="md" tone="accent" type="note" weight="semibold">
                {approval.skill}
              </Typography>{" "}
              <Typography as="span" size="md" type="note" variant="secondary" weight="normal">
                {t("wants")}
              </Typography>{" "}
              {approval.action}
            </Typography>
            <Typography size="base" type="note" variant="secondary">
              {approval.detail}
            </Typography>
          </Stack>

          {done ? (
            <Alert severity={done === "ok" ? "ok" : "error"}>
              {done === "ok" ? t("approved") : t("rejected")}
            </Alert>
          ) : (
            <Stack gap="100">
              {hold ? (
                <HoldButton
                  block
                  doneLabel={t("holdDone")}
                  label={t("holdToApprove")}
                  onConfirm={() => {
                    setDone("ok");
                    onApprove?.(approval);
                  }}
                  tone={kind === "deletion" ? "bad" : "warn"}
                />
              ) : (
                <Button
                  block
                  icon="check"
                  intent="primary"
                  onClick={() => {
                    setDone("ok");
                    onApprove?.(approval);
                  }}
                  tone="ok"
                >
                  {t("approve")}
                </Button>
              )}
              <Button
                block
                icon="x"
                intent="ghost"
                onClick={() => {
                  setDone("no");
                  onReject?.(approval);
                }}
              >
                {t("reject")}
              </Button>
            </Stack>
          )}
        </Stack>
      </Container>
    </Card>
  );
}
