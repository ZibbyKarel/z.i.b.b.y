import {
  Button,
  Card,
  Chip,
  Container,
  Divider,
  IconTile,
  Stack,
  StatusDot,
  Typography,
  type DotTone,
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
    <Card interactive corners radius="sm">
      <Container padding="150">
        <Stack gap="150">
          <Stack direction="row" align="start" gap="150">
            <IconTile glyph={integration.glyph} size="md" />
            <Container grow minW0>
              <Stack gap="25">
                <Typography type="note" mono weight="semibold" size="md" truncate>
                  {integration.name}
                </Typography>
                <Typography
                  type="note"
                  variant="secondary"
                  size="caption"
                  leading="snug"
                >
                  {integration.desc}
                </Typography>
              </Stack>
            </Container>
            <Chip tone={pillTone[integration.status]}>
              <StatusDot tone={sm.tone} size="75" />
              {sm.label}
            </Chip>
          </Stack>

          <Divider />
          <Stack direction="row" align="center" justify="between">
            <Container maxWidth="150px" minW0>
              <Typography type="note" mono size="xs" variant="tertiary" truncate>
                {integration.file}
              </Typography>
            </Container>
            <Stack direction="row" align="center" gap="75">
              <Button intent="ghost" icon="link" size="sm" onClick={() => onTest?.(integration)}>
                Test
              </Button>
              <Button intent="ghost" icon="gear" size="sm" onClick={() => onConfigure?.(integration)}>
                Konfigurovat
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
