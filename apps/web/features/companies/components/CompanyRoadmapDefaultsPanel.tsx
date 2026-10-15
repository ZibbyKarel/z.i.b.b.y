"use client";

import { useTranslations } from "next-intl";
import { Panel, Stack, ToggleField, Typography } from "@zibby/design-system";
import type { Company } from "@zibby/contracts";
import { useUpdateCompanyMutation } from "../mutations";

export enum CompanyRoadmapDefaultsTestId {
  AutoSync = "company-roadmap-defaults-auto-sync",
  AutoPlay = "company-roadmap-defaults-auto-play",
}

export interface CompanyRoadmapDefaultsPanelProps {
  company: Company;
}

/**
 * Company-level roadmap automation defaults (Phase 128, D8): what every linked
 * project inherits until it picks its own Inherit / On / Off. Each switch is the
 * commit (no Save button) and writes the whole `roadmapDefaults` object so the
 * sibling toggle is preserved. A company default is explicit on/off — "unset"
 * only exists at project level, where it means "inherit".
 */
export function CompanyRoadmapDefaultsPanel({ company }: CompanyRoadmapDefaultsPanelProps) {
  const t = useTranslations("companies.roadmapDefaults");
  const updateCompany = useUpdateCompanyMutation();
  const defaults = company.roadmapDefaults ?? {};

  const set = (key: "autoSync" | "autoPlay", value: boolean) =>
    updateCompany.mutate({
      params: { id: company.id },
      body: { roadmapDefaults: { ...defaults, [key]: value } },
    });

  return (
    <Panel header={t("title")} padding="200">
      <Stack gap="200">
        <Typography size="xs" type="note" variant="tertiary">
          {t("hint")}
        </Typography>
        <ToggleField
          checked={defaults.autoSync ?? false}
          data-testid={CompanyRoadmapDefaultsTestId.AutoSync}
          disabled={updateCompany.isPending}
          hint={t("autoSyncHint")}
          label={t("autoSync")}
          onChange={(v) => set("autoSync", v)}
        />
        <ToggleField
          checked={defaults.autoPlay ?? false}
          data-testid={CompanyRoadmapDefaultsTestId.AutoPlay}
          disabled={updateCompany.isPending}
          hint={t("autoPlayHint")}
          label={t("autoPlay")}
          onChange={(v) => set("autoPlay", v)}
        />
      </Stack>
    </Panel>
  );
}
