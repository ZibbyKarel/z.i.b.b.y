import type { Project, ProjectBudgetStatus } from "@zibby/contracts";
import { Progress, Stack, Stat, Tag, Typography, getUsageTone } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { formatCostUsd } from "../../../utils/cost";
import { HudCard } from "../../../components/HudCard/HudCard";
import { groupFilterParam } from "../../runs/statusGroups";
import { useProjectTaskStats } from "../queries";

export interface ProjectCardProps {
  project: Project;
  /** Live budget status for this engagement (Phase 8.1) — bars + running count. */
  budget?: ProjectBudgetStatus;
  onOpen?: (project: Project) => void;
}

/** One labelled run-count bar (used vs cap), tinted by usage. Hidden when uncapped. */
function BudgetBar({ label, used, cap }: { label: string; used: number; cap?: number }) {
  if (cap == null) return null;
  const pct = cap === 0 ? 100 : Math.min(100, Math.round((used / cap) * 100));
  return (
    <Stack gap="25">
      <Stack align="center" direction="row" gap="100" justify="between">
        <Typography mono size="2xs" type="note" variant="tertiary">
          {label}
        </Typography>
        <Typography mono size="2xs" type="note" variant="secondary">
          {used}/{cap}
        </Typography>
      </Stack>
      <Progress
        height="50"
        label={`${label} ${used}/${cap}`}
        tone={getUsageTone(pct)}
        value={pct}
      />
    </Stack>
  );
}

/**
 * The dollar-window counterpart of {@link BudgetBar} (Phase 12) — a spent/cap
 * bar, hidden when the project hasn't set a dollar cap on this window (even
 * though `spentUsd` is always present in the status readout).
 */
function CostBar({
  label,
  spentUsd,
  capUsd,
}: {
  label: string;
  spentUsd: number;
  capUsd?: number;
}) {
  if (capUsd == null) return null;
  const pct = capUsd === 0 ? 100 : Math.min(100, Math.round((spentUsd / capUsd) * 100));
  const readout = `${formatCostUsd(spentUsd)} / ${formatCostUsd(capUsd)}`;
  return (
    <Stack gap="25">
      <Stack align="center" direction="row" gap="100" justify="between">
        <Typography mono size="2xs" type="note" variant="tertiary">
          {label}
        </Typography>
        <Typography mono size="2xs" type="note" variant="secondary">
          {readout}
        </Typography>
      </Stack>
      <Progress height="50" label={`${label} ${readout}`} tone={getUsageTone(pct)} value={pct} />
    </Stack>
  );
}

/**
 * Catalog card for a single project (target directory): a thin container over
 * the generic {@link HudCard}. The footer leads with the per-status task-run stats
 * (the same buckets the project detail's run summary shows, minus the "Celkem"
 * total), each a deep-link into the runs feed pre-filtered to that project + bucket.
 * With a Phase-8 budget set, the daily/weekly run-count and cost bars follow.
 *
 * Phase 78 decision: this card deliberately does NOT show an open-PR count
 * badge. There is no batch/count endpoint — the only source is
 * `GET /projects/:id/prs`, one GitHub API round trip per project — so a badge
 * here would turn a project-list render into N requests. The count instead
 * lives once, on the project detail's header (`ProjectPrCountBadge` in
 * `ProjectPullRequestsPanel.tsx`), sharing its cache key with that screen's PR
 * overview panel.
 */
export function ProjectCard({ project, budget, onOpen }: ProjectCardProps) {
  const t = useTranslations("projects");
  const tr = useTranslations("runs");
  const hasBudget = project.budget != null;
  const { groups } = useProjectTaskStats(project.id);

  // Per-status task stats (minus the "Celkem" total). Each stat is its own
  // `next/link` — living in the card footer, outside the body's click target, so a
  // stat click deep-links to /archiv and never triggers the card's open-detail nav.
  // Phase 108: the runs feed has no global scope any more — each href carries the
  // project explicitly via `?project=<id>` (the pre-Phase-24 mechanism), restored
  // as the one way to drill into a single project's runs.
  //
  // F8d: `/runs` is deleted — repointed at `/archiv` (F2). Pre-existing F2
  // limitation, not fixed here: the Archive screen only reads `?run=`, so
  // `?project=`/`?filter=` land inert (the archive opens unscoped/unfiltered
  // rather than 404ing).
  const taskStats = (
    <Stack wrap direction="row" gap="200">
      {groups.map(({ group: g, count }) => (
        <Link
          data-testid={`project-card-stat-${g.key}`}
          href={`/archiv?project=${project.id}&filter=${groupFilterParam(g)}` as Route}
          key={g.key}
        >
          <Stat
            icon={g.icon}
            label={tr(`group.${g.key}`)}
            tone={count > 0 ? g.tone : "neutral"}
            value={count}
          />
        </Link>
      ))}
    </Stack>
  );

  return (
    <HudCard
      actions={
        <Stack gap="150">
          {taskStats}
          {hasBudget && (
            <Stack gap="100">
              <BudgetBar
                cap={project.budget?.dailyRuns}
                label={t("budgetDaily")}
                used={budget?.daily.used ?? 0}
              />
              <BudgetBar
                cap={project.budget?.weeklyRuns}
                label={t("budgetWeekly")}
                used={budget?.weekly.used ?? 0}
              />
              <CostBar
                capUsd={budget?.dailyCost?.capUsd}
                label={t("budgetDailyCost")}
                spentUsd={budget?.dailyCost?.spentUsd ?? 0}
              />
              <CostBar
                capUsd={budget?.weeklyCost?.capUsd}
                label={t("budgetWeeklyCost")}
                spentUsd={budget?.weeklyCost?.spentUsd ?? 0}
              />
              <CostBar
                capUsd={budget?.monthlyCost?.capUsd}
                label={t("budgetMonthlyCost")}
                spentUsd={budget?.monthlyCost?.spentUsd ?? 0}
              />
              <Stack align="center" direction="row" gap="200">
                <Stat label={t("budgetRunning")} value={String(budget?.running ?? 0)} />
                {(budget?.queued ?? 0) > 0 && (
                  <Stat label={t("budgetQueued")} value={String(budget?.queued ?? 0)} />
                )}
                {(budget?.held ?? 0) > 0 && (
                  <Stat label={t("budgetHeld")} tone="warn" value={String(budget?.held ?? 0)} />
                )}
              </Stack>
            </Stack>
          )}
        </Stack>
      }
      badges={
        project.category
          ? [
              [
                <Tag key="cat" tone="neutral">
                  {project.category}
                </Tag>,
              ],
            ]
          : undefined
      }
      description={project.desc}
      glyph="code"
      logoAlt={project.name}
      logoSrc={project.logo}
      onClick={() => onOpen?.(project)}
      openLabel={t("openAria", { name: project.name })}
      subtitle={project.path}
      title={project.name}
    />
  );
}
