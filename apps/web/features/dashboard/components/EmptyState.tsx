import {
  Button,
  Card,
  Container,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { IconName } from "@zibby/design-system";

export interface EmptyStateProps {
  glyph: IconName;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  hint?: string;
}

export function EmptyState({
  glyph,
  title,
  description,
  actionLabel,
  onAction,
  hint,
}: EmptyStateProps) {
  return (
    <Card background="glass" borderStyle="dashed" radius="none" corners>
      <Container padding={["500", "300"]} textAlign="center">
        <Stack align="center" gap="150">
          <IconTile glyph={glyph} size="xl" radius="default" />
          <Typography type="title" size="3xl" weight="semibold">
            {title}
          </Typography>
          <Container maxWidth="28rem">
            <Typography type="note" mono size="base" leading="relaxed" variant="secondary">
              {description}
            </Typography>
          </Container>
          {actionLabel && (
            <Button intent="run" icon="plus" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {hint && (
            <Typography type="note" mono size="sm" tracking="wider" variant="tertiary">
              {hint}
            </Typography>
          )}
        </Stack>
      </Container>
    </Card>
  );
}
