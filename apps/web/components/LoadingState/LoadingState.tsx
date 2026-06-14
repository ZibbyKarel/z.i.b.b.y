import { Card, Container, Icon, Stack, Typography } from "@zibby/design-system";

export enum LoadingStateTestId {
  Root = "loading-state",
}

export interface LoadingStateProps {
  /** Quiet "Loading…" label. */
  label: string;
}

/**
 * The loading twin of {@link EmptyState} / {@link LoadError} — a quiet placeholder shown
 * while a list query is still pending, so a cold load never flashes the empty state's
 * "create your first…" before the data arrives.
 */
export function LoadingState({ label }: LoadingStateProps) {
  return (
    <Card background="glass" borderStyle="dashed" data-testid={LoadingStateTestId.Root}>
      <Container padding={["500", "300"]} textAlign="center">
        <Stack align="center" gap="150">
          <Icon name="pulse" size="xl" tone="faint" />
          <Typography mono size="sm" type="note" variant="tertiary">
            {label}
          </Typography>
        </Stack>
      </Container>
    </Card>
  );
}
