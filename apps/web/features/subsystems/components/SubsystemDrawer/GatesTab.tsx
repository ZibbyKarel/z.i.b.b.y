"use client";

import type { GlobalGateRule, Project, SubsystemWithStatus } from "@zibby/contracts";
import { Divider, Icon, Stack, Tag, Typography } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { EmptyState } from "../../../../components/EmptyState/EmptyState";
import { HudPanel } from "../../../../components/HudPanel/HudPanel";
import { DecisionBadge, MatcherText, ResolveChips } from "../../../gates/components/RuleParts";
import { GateRulesSection } from "../../../gates/components/GateRulesSection";
import { useGateRulesQuery } from "../../../gates/queries";
import { useProjectsQuery } from "../../../projects";

export enum GatesTabTestId {
  Root = "gates-tab-root",
  SentencesPanel = "gates-tab-sentences-panel",
  SentenceRow = "gates-tab-sentence-row",
  AutopilotPanel = "gates-tab-autopilot-panel",
  AutopilotEmpty = "gates-tab-autopilot-empty",
  /** One per-project autonomy dial row — suffixed `-${project.id}` (Phase 108). */
  AutopilotRow = "gates-tab-autopilot-row",
  /** Suffixed `-${project.id}` (Phase 108: one per listed project). */
  AutopilotLink = "gates-tab-autopilot-link",
  Catalog = "gates-tab-catalog",
}

export interface GatesTabProps {
  subsystem: SubsystemWithStatus;
}

/**
 * One rule rendered as a mad-libs sentence — „Než **[subsystém]** udělá **[akce]**
 * → **[cíl]** → **[chování]**" (design doc, phase-87 plan §2). `[akce] → [cíl]` reuses
 * `MatcherText` verbatim (it already renders each match condition as `lead → pattern`,
 * exactly the akce/cíl split), `[chování]` is the decision — for `ask`, the resolve
 * leaf(s) via `ResolveChips` stand in for the behavior text (the design's "who gets
 * asked" IS the behavior). This is v1 sentence RENDERING of the existing
 * match/decision/resolve structure, nothing new is stored — see `GatesTab`'s own
 * header comment for why a full sentence-builder AUTHORING UI is deferred.
 */
function GateRuleSentenceRow({
  rule,
  subsystemName,
}: {
  rule: GlobalGateRule;
  subsystemName: string;
}) {
  const t = useTranslations("subsystems.gates");
  const tg = useTranslations("gates");
  return (
    // `HudPanel` has no `data-testid` passthrough (it destructures a fixed prop
    // set, no `...rest` spread) — the wrapping `div` is what actually carries it.
    <div data-testid={GatesTabTestId.SentenceRow}>
      <HudPanel padding="150">
        <Stack wrap align="center" direction="row" gap="75">
          <Typography size="sm" type="text" variant="secondary">
            {t("sentencePrefix", { subject: subsystemName })}
          </Typography>
          <MatcherText andLabel={tg("and")} match={rule.match} />
          <Icon name="arrow" size="xs" tone="faint" />
          <DecisionBadge decision={rule.decision} label={tg(`decision_.${rule.decision}`)} />
          {rule.decision === "ask" ? (
            <>
              <Typography size="sm" type="text" variant="secondary">
                {t("behavior.ask")}
              </Typography>
              <ResolveChips resolve={rule.resolve} youLabel={tg("you")} />
            </>
          ) : (
            <Typography size="sm" type="text" variant="secondary">
              {t(`behavior.${rule.decision}`)}
            </Typography>
          )}
        </Stack>
      </HudPanel>
    </div>
  );
}

/**
 * One project's read-only autonomy-policy row (`can_do_alone`/`always_ask`,
 * `ProjectAutonomyPolicy` on the project entity) inside {@link AutopilotSummary}.
 * Deliberately NOT an editor: the project profile tab already owns editing this
 * data (`ProfileScreen`'s autonomy panel), so this links there instead of
 * duplicating the form (CLAUDE.md "never leave the DS-or-local decision
 * implicit" reasoning extends to "never duplicate an editor").
 */
function ProjectAutopilotRow({ project }: { project: Project }) {
  const t = useTranslations("subsystems.gates");
  const policy = project.autonomy_policy ?? {};
  const canDoAlone = policy.can_do_alone ?? [];
  const alwaysAsk = policy.always_ask ?? [];

  return (
    <div data-testid={`${GatesTabTestId.AutopilotRow}-${project.id}`}>
      <HudPanel
        action={
          <Link
            data-testid={`${GatesTabTestId.AutopilotLink}-${project.id}`}
            href={`/projects/${project.id}?tab=profile` as Route}
          >
            <Stack align="center" direction="row" gap="50">
              <Typography mono size="xs" tone="accent" type="note">
                {t("autopilotEditLink")}
              </Typography>
              <Icon name="arrow" size="xs" tone="accent" />
            </Stack>
          </Link>
        }
        padding="150"
        title={project.name}
      >
        <Stack gap="100">
          {canDoAlone.length > 0 && (
            <Stack wrap align="center" direction="row" gap="75">
              <Typography mono size="2xs" type="note" variant="tertiary">
                {t("autopilotCanDoAlone")}
              </Typography>
              {canDoAlone.map((action) => (
                <Tag key={action} tone="ok">
                  {action}
                </Tag>
              ))}
            </Stack>
          )}
          {alwaysAsk.length > 0 && (
            <Stack wrap align="center" direction="row" gap="75">
              <Typography mono size="2xs" type="note" variant="tertiary">
                {t("autopilotAlwaysAsk")}
              </Typography>
              {alwaysAsk.map((action) => (
                <Tag key={action} tone="warn">
                  {action}
                </Tag>
              ))}
            </Stack>
          )}
        </Stack>
      </HudPanel>
    </div>
  );
}

/** True when a project has ANY autonomy policy set — the only ones {@link
 * AutopilotSummary} lists (Phase 108: no active-project scope left to pick a
 * single one, so every policy-bearing project gets its own row instead). */
function hasAutonomyPolicy(project: Project): boolean {
  const policy = project.autonomy_policy ?? {};
  return (policy.can_do_alone?.length ?? 0) > 0 || (policy.always_ask?.length ?? 0) > 0;
}

/**
 * Read-only summary of every project's autonomy policy — the "autopilot dial"
 * the design doc wants on this tab. Phase 108: the Phase-24/102 "active
 * project" scope this used to read is gone — ZIBBY always shows every
 * project's data at once, so this lists one compact dial per project that HAS
 * a policy set (never an editor — see {@link ProjectAutopilotRow}), and an
 * honest empty state when none do.
 */
function AutopilotSummary() {
  const t = useTranslations("subsystems.gates");
  const { data: projects = [] } = useProjectsQuery();
  const withPolicy = projects.filter(hasAutonomyPolicy);

  if (withPolicy.length === 0) {
    return (
      <div data-testid={GatesTabTestId.AutopilotPanel}>
        <HudPanel title={t("autopilotTitle")}>
          <div data-testid={GatesTabTestId.AutopilotEmpty}>
            <Typography size="xs" type="note" variant="tertiary">
              {t("autopilotNoProject")}
            </Typography>
          </div>
        </HudPanel>
      </div>
    );
  }

  return (
    <div data-testid={GatesTabTestId.AutopilotPanel}>
      <HudPanel title={t("autopilotTitle")}>
        <Stack gap="150">
          {withPolicy.map((project) => (
            <ProjectAutopilotRow key={project.id} project={project} />
          ))}
        </Stack>
      </HudPanel>
    </div>
  );
}

/**
 * Gates tab (Phase 87, design doc "the subsystem's slice of gate rules, mad-libs
 * rule sentences, the locked floor visible inside the same UI, plus the per-project
 * autopilot dial"). RECON CORRECTION carried from the phase-87 plan: gate rules are
 * a GLOBAL catalog (`.zibby/data/gate-rules.json`), not project-scoped data —
 * per-project re-homing of gate rules is an OPEN QUESTION left for the operator
 * (no precedence semantics were ever specified for it). This tab is a filtered LENS
 * over that existing global catalog, exactly the design's own "data lives
 * elsewhere, the tab is a filtered lens" principle. Since NS2 F3a the tag this
 * tab filters by is LOAD-BEARING, not mere attribution: a rule tagged for this
 * subsystem is loaded by the gate evaluator as a third bucket (own rules →
 * subsystem rules → locked floor, strictest wins) for every run of a unit this
 * subsystem owns — editing here changes what those runs are allowed to do
 * (tighten-only; the floor still cannot be weakened).
 *
 * Three blocks, top to bottom:
 * 1. Mad-libs sentence rendering of this subsystem's own tagged rules — a plain-
 *    Czech READ view (`GateRuleSentenceRow`). v1 is rendering only; a full
 *    sentence-builder AUTHORING UI (typing a sentence to construct match/decision/
 *    resolve) is deferred until the per-project open question above is resolved —
 *    building a bespoke authoring surface now risks colliding with whatever
 *    precedence model that decision picks.
 * 2. A per-project autopilot dial for every project with a policy set (read-only
 *    + link out; Phase 108 dropped the single "active project" this used to
 *    read — there is no global project scope left in the app).
 * 3. The full editable catalog, scoped via `GateRulesSection`'s `ownerSubsystem`
 *    prop (Phase 87 addition) — create/edit/delete still go through the EXISTING
 *    `RuleModal` form, unchanged. `GateRulesSection` already renders the locked
 *    system floor (`SystemFloorPanel`) internally, UNFILTERED regardless of the
 *    `ownerSubsystem` prop ("the floor is visible, not hidden") — this tab does not
 *    render a second copy of it.
 */
export function GatesTab({ subsystem }: GatesTabProps) {
  const t = useTranslations("subsystems.gates");
  const { data: allRules = [] } = useGateRulesQuery();
  const ownRules = allRules.filter((r) => r.ownerSubsystem === subsystem.id);

  return (
    <Stack data-testid={GatesTabTestId.Root} gap="200">
      <div data-testid={GatesTabTestId.SentencesPanel}>
        <HudPanel title={t("sentencesTitle")}>
          {ownRules.length === 0 ? (
            <EmptyState
              description={t("sentencesEmptyDescription")}
              glyph="shield"
              title={t("sentencesEmptyTitle")}
            />
          ) : (
            <Stack gap="100">
              {ownRules.map((rule) => (
                <GateRuleSentenceRow key={rule.id} rule={rule} subsystemName={subsystem.name} />
              ))}
            </Stack>
          )}
        </HudPanel>
      </div>

      <AutopilotSummary />

      <Divider />

      <div data-testid={GatesTabTestId.Catalog}>
        <GateRulesSection ownerSubsystem={subsystem.id} />
      </div>
    </Stack>
  );
}
