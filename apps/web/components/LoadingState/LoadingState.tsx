import { Card, Container, OrbitLoader } from "@zibby/design-system";

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
 * "create your first…" before the data arrives. Renders the {@link OrbitLoader} so cold
 * loads share the boot splash's animated orbit.
 */
export function LoadingState({ label }: LoadingStateProps) {
  return (
    <Card background="glass" borderStyle="dashed" data-testid={LoadingStateTestId.Root}>
      <Container padding={["500", "300"]} textAlign="center">
        <OrbitLoader label={label} />
      </Container>
    </Card>
  );
}
