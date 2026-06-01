"use client";
import {
  Container,
  IconTile,
  Stack,
  Typography,
  type IconName,
} from "@zibby/design-system"
import { HudPanel } from "./components/HudPanel"

export interface PlaceholderScreenProps {
  label: string
  glyph: IconName
}

/** Graceful placeholder for screens that follow the same card → modal pattern. */
export function PlaceholderScreen({ label, glyph }: PlaceholderScreenProps) {
  return (
    <Container maxWidth="1400px" style={{ marginInline: "auto" }}>
      <HudPanel padding="500">
        <Container padding={["500", "0"]} textAlign="center">
          <Stack align="center" gap="150">
            <IconTile glyph={glyph} size="xl" radius="default" filled={false} />
            <Typography type="title" size="3xl" weight="semibold">
              {label}
            </Typography>
            <Container maxWidth="28rem">
              <Typography type="note" mono size="base" leading="relaxed" variant="secondary">
                Tahle obrazovka je další na řadě. Drží stejný vzor — karty (= soubory na disku) → čudlík →
                modal s promptem → běh na pozadí.
              </Typography>
            </Container>
            <Typography type="note" mono size="sm" tracking="wider" variant="tertiary">
              // v přípravě
            </Typography>
          </Stack>
        </Container>
      </HudPanel>
    </Container>
  )
}
