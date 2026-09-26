"use client";

import {
  Breadcrumb,
  Container,
  Stack,
  type SubNavLinkComponent,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { SignalCreateForm } from "./SignalCreateForm";

export interface SignalCreateScreenProps {
  /** Prefills the producer picker — passed through from `/signals/new?from=`. */
  defaultFrom?: string;
}

/**
 * `/signals/new` chrome — mirrors `SignalDetailScreen`'s `Container` +
 * `PageContainer` wrapping. The guided creator itself lives in
 * {@link SignalCreateForm}; this only supplies the page frame + title.
 */
export function SignalCreateScreen({ defaultFrom }: SignalCreateScreenProps) {
  const t = useTranslations("signals");

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Breadcrumb
            items={[{ label: t("title"), href: "/signals" }, { label: t("create.title") }]}
            linkComponent={Link as SubNavLinkComponent}
          />
          <Typography type="h1">{t("create.title")}</Typography>
          <SignalCreateForm defaultFrom={defaultFrom} />
        </Stack>
      </PageContainer>
    </Container>
  );
}
