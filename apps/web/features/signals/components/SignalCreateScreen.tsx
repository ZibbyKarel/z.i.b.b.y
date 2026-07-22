"use client";

import { Container, Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { ImmersivePage } from "../../../components/layout/ImmersivePage/ImmersivePage";
import { SignalCreateForm } from "./SignalCreateForm";

export interface SignalCreateScreenProps {
  /** Prefills the producer picker — passed through from `/signals/new?from=`. */
  defaultFrom?: string;
}

/**
 * `/signals/new` chrome — mirrors `SignalDetailScreen`'s `ImmersivePage` +
 * `PageContainer` wrapping. The guided creator itself lives in
 * {@link SignalCreateForm}; this only supplies the page frame + title.
 */
export function SignalCreateScreen({ defaultFrom }: SignalCreateScreenProps) {
  const t = useTranslations("signals");

  return (
    <ImmersivePage backHref="/signals" title={t("create.title")}>
      <Container padding={["300", "350"]}>
        <PageContainer>
          <Stack gap="250">
            <SignalCreateForm defaultFrom={defaultFrom} />
          </Stack>
        </PageContainer>
      </Container>
    </ImmersivePage>
  );
}
