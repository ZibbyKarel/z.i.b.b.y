import {
  Button,
  Card,
  Chip,
  Container,
  Divider,
  type DotTone,
  IconTile,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import type { Integration, IntegrationStatus } from "../../../domain";

const statusMeta: Record<IntegrationStatus, { tone: DotTone; label: string }> = {
  connected:    { tone: "ok",    label: "připojeno" },
  disconnected: { tone: "faint", label: "odpojeno" },
  error:        { tone: "bad",   label: "chyba" },
};

const pillTone: Record<IntegrationStatus, "ok" | "neutral" | "bad"> = {
  connected:    "ok",
  disconnected: "neutral",
  error:        "bad",
};

export interface IntegrationCardProps {
  integration: Integration;
  onConfigure?: (integration: Integration) => void;
  onTest?: (integration: Integration) => void;
}

export function IntegrationCard({ integration, onConfigure, onTest }: IntegrationCardProps) {
  const sm = statusMeta[integration.status];
  return (
    <Card corners interactive radius="sm">
      <Container padding="150">
        <Stack gap="150">
          <Stack align="start" direction="row" gap="150">
            <IconTile glyph={integration.glyph} size="md" />
            <Container grow minW0>
              <Stack gap="25">
                <Typography mono truncate size="md" type="note" weight="semibold">
                  {integration.name}
                </Typography>
                <Typography
                  leading="snug"
                  size="caption"
                  type="note"
                  variant="secondary"
                >
                  {integration.desc}
                </Typography>
              </Stack>
            </Container>
            <Chip tone={pillTone[integration.status]}>
              <StatusDot size="75" tone={sm.tone} />
              {sm.label}
            </Chip>
          </Stack>

          <Divider />
          <Stack align="center" direction="row" justify="between">
            <Container minW0 maxWidth="150px">
              <Typography mono truncate size="xs" type="note" variant="tertiary">
                {integration.file}
              </Typography>
            </Container>
            <Stack align="center" direction="row" gap="75">
              <Button icon="link" intent="ghost" onClick={() => onTest?.(integration)} size="sm">
                Test
              </Button>
              <Button icon="gear" intent="ghost" onClick={() => onConfigure?.(integration)} size="sm">
                Konfigurovat
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
