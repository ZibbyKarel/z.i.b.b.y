import {
  Button,
  Card,
  Container,
  Icon,
  Stack,
  Typography,
} from "@zibby/design-system";

export enum LoadErrorTestId {
  Root = "load-error",
  Retry = "load-error-retry",
}

export interface LoadErrorProps {
  title: string;
  description: string;
  /** When both are set, a retry button is shown (typically the query's `refetch`). */
  retryLabel?: string;
  onRetry?: () => void;
}

/**
 * Honest "couldn't load" state — the error twin of {@link EmptyState}. Shown when a
 * catalog query *errors* (e.g. the API is unreachable) so an outage never reads as an
 * empty workspace ("no agents yet — create your first…") and never nudges the operator to
 * recreate entities that already exist. i18n-agnostic string props; reusable per surface.
 */
export function LoadError({ title, description, retryLabel, onRetry }: LoadErrorProps) {
  return (
    <Card background="glass" borderStyle="dashed" data-testid={LoadErrorTestId.Root}>
      <Container padding={["500", "300"]} textAlign="center">
        <Stack align="center" gap="150">
          <Icon name="warn" size="xl" tone="warn" />
          <Typography size="3xl" type="title" weight="semibold">
            {title}
          </Typography>
          <Container maxWidth="28rem">
            <Typography mono leading="relaxed" size="base" type="note" variant="secondary">
              {description}
            </Typography>
          </Container>
          {retryLabel && onRetry && (
            <Button data-testid={LoadErrorTestId.Retry} icon="retry" intent="primary" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
        </Stack>
      </Container>
    </Card>
  );
}
