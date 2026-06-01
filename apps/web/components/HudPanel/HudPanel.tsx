import type { ReactNode } from "react";
import {
  Card,
  Container,
  type Padding,
  Stack,
  Typography,
} from "@zibby/design-system";

export interface HudPanelProps {
  title?: string;
  action?: ReactNode;
  corners?: boolean;
  padding?: Padding;
  children?: ReactNode;
}

export function HudPanel({
  title,
  action,
  corners = true,
  padding = "200",
  children,
}: HudPanelProps) {
  const hasHeader = Boolean(title || action);
  return (
    <Card background="panel" corners={corners} radius="none">
      <Container padding={padding}>
        <Stack gap="150">
          {hasHeader && (
            <Stack align="center" direction="row" justify="between">
              {title ? (
                <Typography
                  mono
                  uppercase
                  size="xs"
                  tracking="widest"
                  type="note"
                  variant="tertiary"
                >
                  <Typography
                    mono
                    as="span"
                    size="xs"
                    style={{ opacity: 0.8 }}
                    tone="accent"
                    type="note"
                  >
                    {'//'}
                  </Typography>{" "}
                  {title}
                </Typography>
              ) : (
                <span />
              )}
              {action}
            </Stack>
          )}
          {children}
        </Stack>
      </Container>
    </Card>
  );
}
