import type { HTMLAttributes, Ref } from "react";
import type { StateTone } from "../../stateTone";
import { Button } from "../Button/Button";
import { Card, CardContent } from "../Card/Card";
import { Row, Stack } from "../Stack/Stack";
import { StatePill } from "../StatePill/StatePill";
import { Tag } from "../Tag/Tag";
import { Typography } from "../Typography/Typography";
import { getUsageTone } from "../Progress/Progress";

export enum GoalCardTestId {
  Root = "goal-card-root",
  Eyebrow = "goal-card-eyebrow",
  State = "goal-card-state",
  Title = "goal-card-title",
  Maker = "goal-card-maker",
  Verifier = "goal-card-verifier",
  BudgetTrack = "goal-card-budget-track",
  BudgetFill = "goal-card-budget-fill",
  BudgetCaption = "goal-card-budget-caption",
  IterationSummary = "goal-card-iteration-summary",
  Resume = "goal-card-resume",
  Stop = "goal-card-stop",
  Open = "goal-card-open",
}

export interface GoalCardProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  /** e.g. `"ship-feature · CLIENT-PORTAL"` — the mock's `{id} · {project}` eyebrow. */
  eyebrow: string;
  state: StateTone;
  /** Overrides the default state label. */
  stateLabel?: string;
  title: string;
  makerLabel: string;
  verifierLabel: string;
  /** Iterations used toward `maxIterations` — drives the run-budget meter. */
  used: number;
  max: number;
  /** e.g. `"Iteration 3 · verifier failed: 2 checks red"`. */
  iterationSummary?: string;
  onResume?: () => void;
  onStop?: () => void;
  onOpen?: () => void;
  resumeLabel?: string;
  stopLabel?: string;
  openLabel?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * `Work Screens.dc.html` → Goals: a maker⇄verifier loop card for `/work/goals`.
 * Header (id · project, state), title, maker/verifier chips, a run-budget meter
 * (iterations used / `maxIterations`), the latest iteration's one-line summary,
 * and resume/stop actions built from the existing goal-run hooks.
 */
export function GoalCard({
  eyebrow,
  state,
  stateLabel,
  title,
  makerLabel,
  verifierLabel,
  used,
  max,
  iterationSummary,
  onResume,
  onStop,
  onOpen,
  resumeLabel = "Resume",
  stopLabel = "Stop",
  openLabel = "Open loop",
  ref,
  ...rest
}: GoalCardProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (used / max) * 100)) : 0;
  const tone = getUsageTone(pct);

  return (
    <Card background="panel" data-testid={GoalCardTestId.Root} radius="none" ref={ref} {...rest}>
      <CardContent padding="200">
        <Stack gap="150">
          <Row align="baseline" justify="between">
            <Typography
              data-testid={GoalCardTestId.Eyebrow}
              tracking="wider"
              type="labelSm"
              variant="tertiary"
            >
              {eyebrow}
            </Typography>
            <span data-testid={GoalCardTestId.State}>
              <StatePill label={stateLabel} state={state} />
            </span>
          </Row>

          <Typography data-testid={GoalCardTestId.Title} type="h3">
            {title}
          </Typography>

          <Row align="center" gap="100">
            <Tag uppercase data-testid={GoalCardTestId.Maker} tone="neutral">
              {`Maker · ${makerLabel}`}
            </Tag>
            <Typography aria-hidden="true" type="labelSm" variant="tertiary">
              ⇄
            </Typography>
            <Tag uppercase data-testid={GoalCardTestId.Verifier} tone="neutral">
              {`Verifier · ${verifierLabel}`}
            </Tag>
          </Row>

          <Stack gap="50">
            <div
              aria-label="Run budget"
              aria-valuemax={max}
              aria-valuemin={0}
              aria-valuenow={used}
              className="relative h-[2px] bg-border"
              data-testid={GoalCardTestId.BudgetTrack}
              role="meter"
            >
              <div
                className={
                  tone === "bad"
                    ? "absolute inset-y-0 left-0 bg-bad"
                    : tone === "warn"
                      ? "absolute inset-y-0 left-0 bg-warn"
                      : "absolute inset-y-0 left-0 bg-ink"
                }
                data-testid={GoalCardTestId.BudgetFill}
                style={{ width: `${pct}%` }}
              />
            </div>
            <Row justify="between">
              <Typography tracking="wider" type="labelSm" variant="secondary">
                RUN BUDGET
              </Typography>
              <Typography
                data-testid={GoalCardTestId.BudgetCaption}
                tracking="wider"
                type="labelSm"
                variant="secondary"
              >
                {`${used} / ${max} RUNS`}
              </Typography>
            </Row>
          </Stack>

          {iterationSummary && (
            <Typography
              data-testid={GoalCardTestId.IterationSummary}
              type="bodySm"
              variant="secondary"
            >
              {iterationSummary}
            </Typography>
          )}

          <Row gap="100">
            {onResume && (
              <Button
                data-testid={GoalCardTestId.Resume}
                intent="primary"
                onClick={onResume}
                size="sm"
              >
                {resumeLabel}
              </Button>
            )}
            {onStop && (
              <Button
                data-testid={GoalCardTestId.Stop}
                intent="secondary"
                onClick={onStop}
                size="sm"
              >
                {stopLabel}
              </Button>
            )}
            {onOpen && (
              <Button data-testid={GoalCardTestId.Open} intent="ghost" onClick={onOpen} size="sm">
                {openLabel}
              </Button>
            )}
          </Row>
        </Stack>
      </CardContent>
    </Card>
  );
}
