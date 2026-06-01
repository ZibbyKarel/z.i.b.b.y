import { useState } from "react"
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  IconTile,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system"
import type { Approval } from "../../../domain"

export interface ApprovalCardProps {
  approval: Approval
  onApprove?: (approval: Approval) => void
  onReject?: (approval: Approval) => void
}

/**
 * Guardrail card: ZIBBY never clicks "order / pay" itself. Shows what the agent
 * wants to do with explicit Approve / Reject actions.
 */
export function ApprovalCard({ approval, onApprove, onReject }: ApprovalCardProps) {
  const [done, setDone] = useState<"ok" | "no" | null>(null)

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
                Čeká na tvé schválení
              </Typography>
            </Stack>
            <Badge tone="neutral">{approval.risk}</Badge>
          </Stack>

          <Stack align="center" direction="row" gap="100">
            <IconTile glyph="cart" radius="default" size="sm" />
            <Stack gap="25">
              <Typography size="md" type="note" weight="semibold">
                <Typography mono as="span" size="md" tone="accent" type="note" weight="semibold">
                  {approval.skill}
                </Typography>{" "}
                <Typography as="span" size="md" type="note" variant="secondary" weight="normal">
                  chce
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
              {done === "ok"
                ? "✓ Schváleno — agent pokračuje"
                : "✕ Zamítnuto — akce zrušena"}
            </Alert>
          ) : (
            <Stack direction="row" gap="100">
              <Container grow>
                <Button
                  block
                  icon="check"
                  intent="approve"
                  onClick={() => {
                    setDone("ok")
                    onApprove?.(approval)
                  }}
                >
                  Schválit
                </Button>
              </Container>
              <Container grow>
                <Button
                  block
                  icon="x"
                  intent="reject"
                  onClick={() => {
                    setDone("no")
                    onReject?.(approval)
                  }}
                >
                  Zamítnout
                </Button>
              </Container>
            </Stack>
          )}
        </Stack>
      </Container>
    </Card>
  )
}
