"use client";

import { Alert, CodeBlock, Panel, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { formatCostUsd } from "../../../utils/cost";
// Direct path (not the `../../workflows` barrel) keeps RunDetail's isolated tests,
// which mock that barrel, working.
import { useWorkflowRunsQuery } from "../../workflows/queries/useWorkflowRunsQuery";
import { useWorkflowsQuery } from "../../workflows/queries/useWorkflowsQuery";

export interface RunWorkflowSummaryProps {
  runId: string;
  /** The workflow definition id (to tell whether the run writes a `book.md`). */
  owner: string;
  /** The run's plain total cost, shown when it has no spend cap. */
  totalCostUsd?: number;
}

const PARKED_LABEL = {
  gate: "parkedGate",
  budget: "parkedBudget",
  child: "parkedChild",
} as const;

/**
 * Run-level facts the unified task row doesn't carry: the spend cap progress
 * (`spent / cap`), why a gate/budget park is waiting, and — for a book workflow —
 * where the finished folder is. Reads the live workflow-run list; renders nothing
 * when the run isn't in it and there is nothing to say.
 */
export function RunWorkflowSummary({ runId, owner, totalCostUsd }: RunWorkflowSummaryProps) {
  const t = useTranslations("runs");
  const { data: runs } = useWorkflowRunsQuery();
  const { data: workflows } = useWorkflowsQuery();
  const run = runs?.find((r) => r.workflowRunId === runId);
  const writesBook = workflows
    ?.find((p) => p.id === owner)
    ?.phases.some((ph) => ph.produces === "book.md");

  const reason =
    run?.parkedReason === "gate" || run?.parkedReason === "budget" || run?.parkedReason === "child"
      ? run.parkedReason
      : null;
  const budget = run?.budget;
  if (!reason && !budget && !(writesBook && run?.cwd) && totalCostUsd == null) return null;

  return (
    <Panel data-testid="run-workflow-summary" padding="250">
      <Stack gap="150">
        {reason && <Alert severity="warn">{t(PARKED_LABEL[reason])}</Alert>}
        {budget ? (
          <Typography mono size="xs" type="note" variant="secondary">
            {t("budgetSpent", {
              spent: formatCostUsd(budget.spentUsd),
              cap: formatCostUsd(budget.maxCostUsd),
            })}
          </Typography>
        ) : (
          totalCostUsd != null && (
            <Typography mono size="xs" type="note" variant="secondary">
              {t("totalCost", { cost: formatCostUsd(totalCostUsd) })}
            </Typography>
          )
        )}
        {writesBook && run?.cwd && (
          <Stack gap="50">
            <Typography mono size="2xs" type="note" variant="tertiary">
              {t("bookFolder")}
            </Typography>
            <CodeBlock text={`${run.cwd}/book`} />
          </Stack>
        )}
      </Stack>
    </Panel>
  );
}
