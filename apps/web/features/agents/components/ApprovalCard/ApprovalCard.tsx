import {
  Alert,
  Button,
  Card,
  Chip,
  Container,
  IconTile,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Approval } from "../../../../domain";

export interface ApprovalCardProps {
  approval: Approval;
  onApprove?: (approval: Approval) => void;
  onReject?: (approval: Approval) => void;
}

/**
 * Guardrail card: ZIBBY never clicks "order / pay" itself. Shows what the agent
 * wants to do with explicit Approve / Reject actions.
 */
export function ApprovalCard({
  approval,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const t = useTranslations("approval");
  const [done, setDone] = useState<"ok" | "no" | null>(null);

  return (
    <Card corners radius="sm" tone="bad">
      <Container padding="200">
        <Stack gap="150">
          <Stack align="center" direction="row" gap="100" justify="between">
            <Stack align="center" direction="row" gap="100">
              <StatusDot pulse tone="bad" />
              <Typography
                mono
                uppercase
                size="sm"
                tone="bad"
                tracking="widest"
                type="note"
                weight="semibold"
              >
                {t("waiting")}
              </Typography>
            </Stack>
            <Chip tone="neutral">{approval.risk}</Chip>
          </Stack>

          <Stack align="center" direction="row" gap="100">
            <IconTile glyph="cart" radius="default" size="sm" />
            <Stack gap="25">
              <Typography size="md" type="note" weight="semibold">
                <Typography
                  mono
                  as="span"
                  size="md"
                  tone="accent"
                  type="note"
                  weight="semibold"
                >
                  {approval.skill}
                </Typography>{" "}
                <Typography
                  as="span"
                  size="md"
                  type="note"
                  variant="secondary"
                  weight="normal"
                >
                  {t("wants")}
                </Typography>{" "}
                {approval.action}
              </Typography>
              <Typography size="base" type="note" variant="secondary">
                {approval.detail}
              </Typography>
            </Stack>
          </Stack>

          {done ? (
            <Alert severity={done === "ok" ? "ok" : "error"}>
              {done === "ok" ? t("approved") : t("rejected")}
            </Alert>
          ) : (
            <Stack direction="row" gap="100">
              <Container grow>
                <Button
                  block
                  icon="check"
                  intent="approve"
                  onClick={() => {
                    setDone("ok");
                    onApprove?.(approval);
                  }}
                >
                  {t("approve")}
                </Button>
              </Container>
              <Container grow>
                <Button
                  block
                  icon="x"
                  intent="reject"
                  onClick={() => {
                    setDone("no");
                    onReject?.(approval);
                  }}
                >
                  {t("reject")}
                </Button>
              </Container>
            </Stack>
          )}
        </Stack>
      </Container>
    </Card>
  );
}
