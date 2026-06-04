import { Card, Container, Icon, Stack, Typography } from "@zibby/design-system";
import type { DashboardApproval } from "../approval";
import { SEVERITY, riskMeta } from "../approval";
import { RiskBadge } from "./RiskBadge";
import { SeverityMeter } from "./SeverityMeter";

export interface ApprovalQueueCardProps {
  approval: DashboardApproval;
  selected: boolean;
  riskLabel: string;
  actorKindLabel: string;
  onSelect: (id: string) => void;
}

/** One row in the approval queue (master list) — actor, action, risk + severity. */
export function ApprovalQueueCard({
  approval,
  selected,
  riskLabel,
  actorKindLabel,
  onSelect,
}: ApprovalQueueCardProps) {
  const meta = riskMeta(approval.riskType);
  return (
    <Card
      corners
      as="button"
      background="panel"
      onClick={() => onSelect(approval.id)}
      radius="sm"
      selected={selected}
      tone={SEVERITY[approval.risk].tone}
    >
      <Container padding="200">
        <Stack gap="150">
          <Stack align="center" direction="row" gap="100">
            <span
              style={{
                width: 32,
                height: 32,
                flex: "0 0 auto",
                borderRadius: 2,
                display: "grid",
                placeItems: "center",
                background: `color-mix(in srgb, ${meta.cssVar} 14%, transparent)`,
                color: meta.cssVar,
                border: `1px solid color-mix(in srgb, ${meta.cssVar} 40%, transparent)`,
              }}
            >
              <Icon name={approval.glyph ?? meta.glyph} size="sm" />
            </span>
            <Container minW0>
              <Stack gap="25">
                <Stack align="center" direction="row" gap="75">
                  <Typography mono truncate type="note" weight="bold">
                    {approval.skill}
                  </Typography>
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {actorKindLabel}
                  </Typography>
                </Stack>
                <Typography truncate size="sm" type="text" variant="secondary">
                  {approval.action}
                </Typography>
              </Stack>
            </Container>
          </Stack>
          <Stack align="center" direction="row" gap="100" justify="between">
            <Stack align="center" direction="row" gap="100">
              <RiskBadge label={riskLabel} type={approval.riskType} />
              <SeverityMeter severity={approval.risk} />
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
