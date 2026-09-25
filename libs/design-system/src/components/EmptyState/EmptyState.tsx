import type { HTMLAttributes, ReactNode, Ref } from "react";
import { Stack } from "../Stack/Stack";
import { Container } from "../Container/Container";
import { Card, CardContent } from "../Card/Card";
import { Typography } from "../Typography/Typography";

export enum EmptyStateTestId {
  Root = "empty-state-root",
  Title = "empty-state-title",
  Body = "empty-state-body",
  Action = "empty-state-action",
}

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  title: string;
  body?: string;
  /** A `Button` (or similar) the caller renders — EmptyState only positions it. */
  action?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The one "nothing here" surface — a dashed hairline frame with a title, an
 * optional body sentence and an optional action, centred. Every list, table
 * and panel reaches for this instead of hand-rolling its own copy.
 */
export function EmptyState({ title, body, action, ref, ...rest }: EmptyStateProps) {
  return (
    <Card
      background="surface"
      borderStyle="dashed"
      data-testid={EmptyStateTestId.Root}
      radius="none"
      ref={ref}
      {...rest}
    >
      <CardContent padding="400">
        <Stack align="center" gap="100">
          <Typography align="center" data-testid={EmptyStateTestId.Title} type="h3">
            {title}
          </Typography>
          {body && (
            <Container maxWidth="28rem">
              <Typography
                align="center"
                data-testid={EmptyStateTestId.Body}
                type="bodySm"
                variant="secondary"
              >
                {body}
              </Typography>
            </Container>
          )}
          {action && <div data-testid={EmptyStateTestId.Action}>{action}</div>}
        </Stack>
      </CardContent>
    </Card>
  );
}
