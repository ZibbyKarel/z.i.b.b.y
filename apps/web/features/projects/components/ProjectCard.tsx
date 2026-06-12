import type { Project, ProjectBudgetStatus } from "@zibby/contracts";
import {
  Progress,
  Stack,
  Stat,
  Tag,
  Typography,
  getUsageTone,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudCard } from "../../../components/HudCard/HudCard";

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
      <Progress height="50" label={`${label} ${used}/${cap}`} tone={getUsageTone(pct)} value={pct} />
    </Stack>
  );
}

/**
 * Catalog card for a single project (target directory): a thin container over
 * the generic {@link HudCard}. With a Phase-8 budget set, the footer shows the
 * daily/weekly run-count bars (tinted by usage) and the live running count; with
 * no budget the card is unchanged.
 */
export function ProjectCard({ project, budget, onOpen }: ProjectCardProps) {
  const t = useTranslations("projects");
  const hasBudget = project.budget != null;

  return (
    <HudCard
      actions={
        hasBudget ? (
          <Stack gap="100">
            <BudgetBar cap={project.budget?.dailyRuns} label={t("budgetDaily")} used={budget?.daily.used ?? 0} />
            <BudgetBar cap={project.budget?.weeklyRuns} label={t("budgetWeekly")} used={budget?.weekly.used ?? 0} />
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
        ) : undefined
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
      onClick={() => onOpen?.(project)}
      openLabel={t("openAria", { name: project.name })}
      subtitle={project.path}
      title={project.name}
    />
  );
}
