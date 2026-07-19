"use client";

import { Container } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { ImmersivePage } from "../../components/layout/ImmersivePage/ImmersivePage";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { GateRulesSection } from "./components/GateRulesSection";

export function Screen() {
  const t = useTranslations("gates");

  return (
    <ImmersivePage subtitle={t("subtitle")} title={t("title")}>
      <Container padding={["300", "350"]}>
        <PageContainer>
          <GateRulesSection surface="glass" />
        </PageContainer>
      </Container>
    </ImmersivePage>
  );
}
