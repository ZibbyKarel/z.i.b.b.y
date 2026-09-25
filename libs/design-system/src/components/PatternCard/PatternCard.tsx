import type { HTMLAttributes, Ref } from "react";
import type { StateTone } from "../../stateTone";
import { Button } from "../Button/Button";
import { CellStrip } from "../CellStrip/CellStrip";
import { Panel } from "../Panel/Panel";
import { Row } from "../Stack/Stack";
import { Tag } from "../Tag/Tag";
import { Typography } from "../Typography/Typography";

export enum PatternCardTestId {
  Root = "pattern-card-root",
  Scope = "pattern-card-scope",
  Status = "pattern-card-status",
  Rule = "pattern-card-rule",
  Evidence = "pattern-card-evidence",
  Accept = "pattern-card-accept",
  Dismiss = "pattern-card-dismiss",
}

export interface PatternCardProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  /** e.g. `"API · PROPOSED"` — the mock's `{scope} · {status}` eyebrow. */
  scope: string;
  /** The learned rule's one imperative sentence. */
  rule: string;
  /** One dot per occurrence toward promotion (`done`) vs. the remainder (`error`). */
  evidence: readonly StateTone[];
  /** Rendered next to the dots, e.g. `"2 / 2"` or `"NOW A RULE"`. */
  evidenceLabel: string;
  /** Present while the rule is still actionable; omitted once accepted/dismissed. */
  onAccept?: () => void;
  onDismiss?: () => void;
  acceptLabel?: string;
  dismissLabel?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * DS.md §8 "Learned patterns" card (ZB-08 `/policy/patterns`) — a review-learning
 * rule presented as a suggestion: its scope/status, the one-sentence rule, a
 * {@link CellStrip} of its occurrence evidence, and accept/dismiss actions.
 * Nothing changes until the operator accepts (Law 1) — this is a presentation
 * shell only, no gate logic of its own.
 */
export function PatternCard({
  scope,
  rule,
  evidence,
  evidenceLabel,
  onAccept,
  onDismiss,
  acceptLabel = "Accept as rule",
  dismissLabel = "Dismiss",
  ref,
  ...rest
}: PatternCardProps) {
  return (
    <Panel data-testid={PatternCardTestId.Root} padding="200" ref={ref} {...rest}>
      <Row align="start" gap="200" justify="between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Row gap="100">
            <Tag uppercase data-testid={PatternCardTestId.Scope} tone="neutral">
              {scope}
            </Tag>
          </Row>
          <Typography data-testid={PatternCardTestId.Rule} type="bodySm">
            {rule}
          </Typography>
          <Row align="center" gap="100">
            <span data-testid={PatternCardTestId.Evidence}>
              <CellStrip cells={evidence} />
            </span>
            <Typography data-testid={PatternCardTestId.Status} type="labelSm" variant="tertiary">
              {evidenceLabel}
            </Typography>
          </Row>
        </div>
        {(onAccept || onDismiss) && (
          <Row gap="100">
            {onAccept && (
              <Button
                data-testid={PatternCardTestId.Accept}
                intent="primary"
                onClick={onAccept}
                size="sm"
              >
                {acceptLabel}
              </Button>
            )}
            {onDismiss && (
              <Button
                data-testid={PatternCardTestId.Dismiss}
                intent="secondary"
                onClick={onDismiss}
                size="sm"
              >
                {dismissLabel}
              </Button>
            )}
          </Row>
        )}
      </Row>
    </Panel>
  );
}
