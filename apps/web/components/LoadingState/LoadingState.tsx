import { Card, Container, Progress, Stack, Typography } from "@zibby/design-system";

export enum LoadingStateTestId {
  Root = "loading-state",
  Label = "loading-state-label",
  Bar = "loading-state-bar",
}

export interface LoadingStateProps {
  /** Quiet "Loading…" label. */
  label: string;
}

/**
 * The loading twin of {@link EmptyState} / {@link LoadError} — a quiet placeholder shown
 * while a list query is still pending, so a cold load never flashes the empty state's
 * "create your first…" before the data arrives. A mono uppercase status line over an
 * indeterminate ink bar — the ZibbyCorp loading language (DS.md §1.2/§6: no glow, no blur).
 */
export function LoadingState({ label }: LoadingStateProps) {
  return (
    <Card background="panel" borderStyle="dashed" data-testid={LoadingStateTestId.Root}>
      <Container padding={["500", "300"]} textAlign="center">
        <Stack align="center" gap="150" role="status">
          <Typography
            mono
            data-testid={LoadingStateTestId.Label}
            tracking="wider"
            type="labelSm"
            variant="secondary"
          >
            {label}
          </Typography>
          <Container maxWidth="160px" width="100%">
            <Progress indeterminate data-testid={LoadingStateTestId.Bar} height="25" />
          </Container>
        </Stack>
      </Container>
    </Card>
  );
}
