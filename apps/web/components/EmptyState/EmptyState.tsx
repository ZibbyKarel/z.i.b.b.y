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
    <Card background="glass" borderStyle="dashed">
      <Container padding={["500", "300"]} textAlign="center">
        <Stack align="center" gap="150">
          <IconTile glyph={glyph} radius="default" size="xl" />
          <Typography size="3xl" type="title" weight="semibold">
            {title}
          </Typography>
          <Container maxWidth="28rem">
            <Typography mono leading="relaxed" size="base" type="note" variant="secondary">
              {description}
            </Typography>
          </Container>
          {actionLabel && (
            <Button icon="plus" intent="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {hint && (
            <Typography mono size="sm" tracking="wider" type="note" variant="tertiary">
              {hint}
            </Typography>
          )}
        </Stack>
      </Container>
    </Card>
  );
}
