"use client";

import type { SubsystemWithStatus } from "@zibby/contracts";
import { Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../../components/HudPanel/HudPanel";
import { HandoffRulesSection } from "../../../handoff/components/HandoffRulesSection";
import { useHandoffRulesQuery } from "../../../handoff/queries";

export enum HandoffTabTestId {
  Root = "handoff-tab-root",
  Panel = "handoff-tab-panel",
}

export interface HandoffTabProps {
  subsystem: SubsystemWithStatus;
}

/**
 * Předávání tab (P2, `docs/superpowers/specs/2026-07-22-subsystem-handoff-design.md`
 * Part 2): this subsystem's own OUTGOING handoff rules — a filtered lens over the
 * standing rule catalog, same "data lives elsewhere, the tab is a filtered lens"
 * principle `GatesTab` established. Incoming rules (`to === subsystem.id`) are
 * deliberately out of scope here — only the subsystem's own dispatch behavior is
 * this tab's concern, mirroring how `GatesTab` only shows a subsystem's OWN tagged
 * gate rules, not rules that merely reference it.
 */
export function HandoffTab({ subsystem }: HandoffTabProps) {
  const t = useTranslations("subsystems.handoff");
  const { data: allRules = [] } = useHandoffRulesQuery();
  const outgoing = allRules.filter((r) => r.from === subsystem.id);

  return (
    <Stack data-testid={HandoffTabTestId.Root} gap="200">
      <div data-testid={HandoffTabTestId.Panel}>
        <HudPanel title={t("panelTitle")}>
          <HandoffRulesSection
            fromSubsystemId={subsystem.id}
            rules={outgoing}
            subsystemName={subsystem.name}
          />
        </HudPanel>
      </div>
    </Stack>
  );
}
