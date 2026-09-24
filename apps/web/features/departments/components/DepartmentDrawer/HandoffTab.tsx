"use client";

import type { DepartmentWithStatus } from "@zibby/contracts";
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
  department: DepartmentWithStatus;
}

/**
 * Předávání tab (P2, `docs/superpowers/specs/2026-07-22-department-handoff-design.md`
 * Part 2): this department's own OUTGOING handoff rules — a filtered lens over the
 * standing rule catalog, same "data lives elsewhere, the tab is a filtered lens"
 * principle `GatesTab` established. Incoming rules (`to === department.id`) are
 * deliberately out of scope here — only the department's own dispatch behavior is
 * this tab's concern, mirroring how `GatesTab` only shows a department's OWN tagged
 * gate rules, not rules that merely reference it.
 */
export function HandoffTab({ department }: HandoffTabProps) {
  const t = useTranslations("departments.handoff");
  const { data: allRules = [] } = useHandoffRulesQuery();
  const outgoing = allRules.filter((r) => r.from === department.id);

  return (
    <Stack data-testid={HandoffTabTestId.Root} gap="200">
      <div data-testid={HandoffTabTestId.Panel}>
        <HudPanel title={t("panelTitle")}>
          <HandoffRulesSection
            departmentName={department.name}
            fromDepartmentId={department.id}
            rules={outgoing}
          />
        </HudPanel>
      </div>
    </Stack>
  );
}
