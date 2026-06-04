"use client";
import { useTranslations } from "next-intl"
import {
  Container,
  type IconName,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system"
import { HudPanel } from "../../HudPanel/HudPanel"

export interface PlaceholderScreenProps {
  label: string
  glyph: IconName
}

/** Graceful placeholder for screens that follow the same card → modal pattern. */
export function PlaceholderScreen({ label, glyph }: PlaceholderScreenProps) {
  const t = useTranslations("placeholder")
  return (
     
    <Container maxWidth="1400px" style={{ marginInline: "auto" }}>
      <HudPanel padding="500">
        <Container padding={["500", "0"]} textAlign="center">
          <Stack align="center" gap="150">
            <IconTile filled={false} glyph={glyph} radius="default" size="xl" />
            <Typography size="3xl" type="title" weight="semibold">
              {label}
            </Typography>
            <Container maxWidth="28rem">
              <Typography mono leading="relaxed" size="base" type="note" variant="secondary">
                {t("body")}
              </Typography>
            </Container>
            <Typography mono size="sm" tracking="wider" type="note" variant="tertiary">
              {t("hint")}
            </Typography>
          </Stack>
        </Container>
      </HudPanel>
    </Container>
  )
}
