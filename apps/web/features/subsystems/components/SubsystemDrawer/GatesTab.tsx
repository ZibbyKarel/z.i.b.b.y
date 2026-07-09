"use client";

import type { GlobalGateRule, SubsystemWithStatus } from "@zibby/contracts";
import { Divider, Icon, Stack, Tag, Typography } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { EmptyState } from "../../../../components/EmptyState/EmptyState";
import { HudPanel } from "../../../../components/HudPanel/HudPanel";
import { DecisionBadge, MatcherText, ResolveChips } from "../../../gates/components/RuleParts";
import { GateRulesSection } from "../../../gates/components/GateRulesSection";
import { useGateRulesQuery } from "../../../gates/queries";
import { useActiveProject, useProjectsQuery } from "../../../projects";

export enum GatesTabTestId {
  Root = "gates-tab-root",
  SentencesPanel = "gates-tab-sentences-panel",
  SentenceRow = "gates-tab-sentence-row",
  AutopilotPanel = "gates-tab-autopilot-panel",
  AutopilotEmpty = "gates-tab-autopilot-empty",
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
function GateRuleSentenceRow({ rule, subsystemName }: { rule: GlobalGateRule; subsystemName: string }) {
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
 * Read-only summary of the ACTIVE project's autonomy policy (`can_do_alone`/
 * `always_ask`, `ProjectAutonomyPolicy` on the project entity) — the "autopilot
 * dial" the design doc wants on this tab. Deliberately NOT an editor: the project
 * profile tab already owns editing this data (`ProfileScreen`'s autonomy panel),
 * so this links there instead of duplicating the form (CLAUDE.md "never leave the
 * DS-or-local decision implicit" reasoning extends to "never duplicate an editor").
 * The active project is a pure client-side view scope (`useActiveProject`, NOT a
 * security boundary) shared with the inline project selector in `CommandLine`
 * (Phase 102) — this dial just reads whichever project is currently selected there.
 */
function AutopilotSummary() {
  const t = useTranslations("subsystems.gates");
  const { activeProjectId } = useActiveProject();
  const { data: projects = [] } = useProjectsQuery();

  if (!activeProjectId) {
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

  const project = projects.find((p) => p.id === activeProjectId);
  const policy = project?.autonomy_policy ?? {};
  const canDoAlone = policy.can_do_alone ?? [];
  const alwaysAsk = policy.always_ask ?? [];
  const hasPolicy = canDoAlone.length > 0 || alwaysAsk.length > 0;

  return (
    <div data-testid={GatesTabTestId.AutopilotPanel}>
      <HudPanel
        action={
          <Link
            data-testid={GatesTabTestId.AutopilotLink}
            href={`/projects/${activeProjectId}?tab=profile` as Route}
          >
            <Stack align="center" direction="row" gap="50">
              <Typography mono size="xs" tone="accent" type="note">
                {t("autopilotEditLink")}
              </Typography>
              <Icon name="arrow" size="xs" tone="accent" />
            </Stack>
          </Link>
        }
        title={t("autopilotTitle")}
      >
        <Stack gap="100">
          <Typography size="sm" type="text" weight="semibold">
            {project?.name ?? activeProjectId}
          </Typography>
          {!hasPolicy ? (
            <Typography size="xs" type="note" variant="tertiary">
              {t("autopilotNoneSet")}
            </Typography>
          ) : (
            <>
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
            </>
          )}
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
 * elsewhere, the tab is a filtered lens" principle.
 *
 * Three blocks, top to bottom:
 * 1. Mad-libs sentence rendering of this subsystem's own tagged rules — a plain-
 *    Czech READ view (`GateRuleSentenceRow`). v1 is rendering only; a full
 *    sentence-builder AUTHORING UI (typing a sentence to construct match/decision/
 *    resolve) is deferred until the per-project open question above is resolved —
 *    building a bespoke authoring surface now risks colliding with whatever
 *    precedence model that decision picks.
 * 2. The active project's autopilot dial (read-only + link out).
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
