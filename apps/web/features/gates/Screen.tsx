"use client";

import { useTranslations } from "next-intl";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Stack } from "@zibby/design-system";
import { GateRulesSection } from "./components/GateRulesSection";

export function Screen() {
  const t = useTranslations("gates");

  return (
    <PageContainer>
      <Stack gap="250">
        <PageHeader subtitle={t("subtitle")} title={t("title")} />
        <GateRulesSection />
      </Stack>
    </PageContainer>
  );
}
