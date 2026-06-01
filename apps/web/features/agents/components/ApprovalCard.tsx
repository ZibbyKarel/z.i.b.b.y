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
    <Card tone="bad" corners radius="sm">
      <Container padding="200">
        <Stack gap="150">
          <Stack direction="row" align="center" justify="between" gap="100">
            <Stack direction="row" align="center" gap="100">
              <StatusDot tone="bad" pulse />
              <Typography
                type="note"
                tone="bad"
                mono
                size="sm"
                weight="semibold"
                uppercase
                tracking="widest"
              >
                Čeká na tvé schválení
              </Typography>
            </Stack>
            <Badge tone="neutral">{approval.risk}</Badge>
          </Stack>

          <Stack direction="row" align="center" gap="100">
            <IconTile glyph="cart" size="sm" radius="default" />
            <Stack gap="25">
              <Typography type="note" size="md" weight="semibold">
                <Typography as="span" type="note" size="md" mono tone="accent" weight="semibold">
                  {approval.skill}
                </Typography>{" "}
                <Typography as="span" type="note" size="md" variant="secondary" weight="normal">
                  chce
                </Typography>{" "}
                {approval.action}
              </Typography>
              <Typography type="note" variant="secondary" size="base">
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
                  intent="approve"
                  icon="check"
                  block
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
                  intent="reject"
                  icon="x"
                  block
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
