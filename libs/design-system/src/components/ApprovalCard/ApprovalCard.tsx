import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";
import type { StateTone } from "../../stateTone";
import { AgentGlyph } from "../AgentGlyph/AgentGlyph";
import { Button } from "../Button/Button";
import { Container } from "../Container/Container";
import { Row } from "../Stack/Stack";
import { Tag } from "../Tag/Tag";
import { Typography } from "../Typography/Typography";

export type ApprovalCardDensity = "card" | "row";

export enum ApprovalCardTestId {
  Root = "approval-card-root",
  Glyph = "approval-card-glyph",
  Name = "approval-card-name",
  Meta = "approval-card-meta",
  Waited = "approval-card-waited",
  Request = "approval-card-request",
  TaskRef = "approval-card-task-ref",
  HighRisk = "approval-card-high-risk",
  Approve = "approval-card-approve",
  Deny = "approval-card-deny",
  Open = "approval-card-open",
}

export interface ApprovalCardProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  /** Deterministic seed for the requesting agent's {@link AgentGlyph}. */
  glyphSeed: string;
  agentName: string;
  /** Secondary line — e.g. `"TASK · DEV"` (kind · department). */
  meta: string;
  /** Elapsed wait, already formatted by the caller (e.g. `"12m"`). */
  waited: string;
  request: string;
  taskRef?: string;
  /** The requesting agent's live state (glyph tint/motion). An approval gate is
   *  inherently a `blocked` state for the agent that fired it. */
  state?: StateTone;
  /**
   * D-013/D-014: approve is a single click everywhere, even for high-risk
   * requests — `HoldButton` is never substituted here. `highRisk` only adds a
   * visible marker; it does not change the interaction.
   */
  highRisk?: boolean;
  /** Overrides the default English "High risk" marker text. */
  highRiskLabel?: string;
  /** `"card"` is the full DS.md §8 stacked layout (rail/inbox); `"row"` compacts
   *  it to a single line for a dense list (a `DataTable` cell, a digest). */
  density?: ApprovalCardDensity;
  onApprove?: () => void;
  onDeny?: () => void;
  onOpen?: () => void;
  approveLabel?: string;
  denyLabel?: string;
  openLabel?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * DS.md §8 "Approval card (NEEDS YOU)" — the gate surface for the approvals
 * rail/inbox. Every action is a single click (D-013/D-014 supersedes the
 * PART-A O-13 default): `highRisk` renders a visible marker, not a
 * `HoldButton`, because the operator explicitly asked for one-click approval
 * everywhere.
 */
export function ApprovalCard({
  glyphSeed,
  agentName,
  meta,
  waited,
  request,
  taskRef,
  state = "blocked",
  highRisk = false,
  highRiskLabel = "High risk",
  density = "card",
  onApprove,
  onDeny,
  onOpen,
  approveLabel = "Approve",
  denyLabel = "Deny",
  openLabel = "Open",
  ref,
  ...rest
}: ApprovalCardProps) {
  const glyphSize = density === "row" ? 22 : 30;

  return (
    <div
      className={cn(
        "flex bg-background border border-line-2",
        density === "row" ? "flex-row items-center gap-3 px-3 py-2" : "flex-col gap-2.5 p-3",
      )}
      data-density={density}
      data-testid={ApprovalCardTestId.Root}
      ref={ref}
      {...rest}
    >
      <div className={cn("flex items-center gap-2.5", density === "row" && "min-w-0 flex-1")}>
        <span data-testid={ApprovalCardTestId.Glyph}>
          <AgentGlyph seed={glyphSeed} size={glyphSize} state={state} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Typography
            truncate
            data-testid={ApprovalCardTestId.Name}
            type="labelSm"
            weight="semibold"
          >
            {agentName}
          </Typography>
          <Typography truncate data-testid={ApprovalCardTestId.Meta} type="labelSm">
            {meta}
          </Typography>
        </div>
        {density === "card" && (
          <Typography nowrap data-testid={ApprovalCardTestId.Waited} type="labelSm">
            {waited}
          </Typography>
        )}
      </div>

      {density === "row" ? (
        <>
          <Typography nowrap data-testid={ApprovalCardTestId.Waited} type="labelSm">
            {waited}
          </Typography>
          {highRisk && (
            <Tag uppercase data-testid={ApprovalCardTestId.HighRisk} icon="warn" tone="blocked">
              {highRiskLabel}
            </Tag>
          )}
          <Row gap="50" shrink={false}>
            <Button
              aria-label={approveLabel}
              data-testid={ApprovalCardTestId.Approve}
              icon="check"
              intent="primary"
              onClick={onApprove}
              size="sm"
            />
            <Button
              aria-label={denyLabel}
              data-testid={ApprovalCardTestId.Deny}
              icon="x"
              intent="secondary"
              onClick={onDeny}
              size="sm"
            />
            <Button
              aria-label={openLabel}
              data-testid={ApprovalCardTestId.Open}
              icon="arrow"
              intent="secondary"
              onClick={onOpen}
              size="sm"
            />
          </Row>
        </>
      ) : (
        <>
          {highRisk && (
            <Tag uppercase data-testid={ApprovalCardTestId.HighRisk} icon="warn" tone="blocked">
              {highRiskLabel}
            </Tag>
          )}
          <Typography data-testid={ApprovalCardTestId.Request} type="bodySm">
            {request}
          </Typography>
          {taskRef && (
            <Typography data-testid={ApprovalCardTestId.TaskRef} type="labelSm">
              {taskRef}
            </Typography>
          )}
          <Row gap="100">
            <Container grow>
              <Button
                block
                data-testid={ApprovalCardTestId.Approve}
                intent="primary"
                onClick={onApprove}
              >
                {approveLabel}
              </Button>
            </Container>
            <Container grow>
              <Button
                block
                data-testid={ApprovalCardTestId.Deny}
                intent="secondary"
                onClick={onDeny}
              >
                {denyLabel}
              </Button>
            </Container>
            <Button
              aria-label={openLabel}
              data-testid={ApprovalCardTestId.Open}
              icon="arrow"
              intent="secondary"
              onClick={onOpen}
            />
          </Row>
        </>
      )}
    </div>
  );
}
