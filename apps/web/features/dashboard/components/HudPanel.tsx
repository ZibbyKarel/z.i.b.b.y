import type { ReactNode } from "react";
import {
  Card,
  Container,
  Stack,
  Typography,
  type Padding,
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
    <Card background="panel" radius="none" corners={corners}>
      <Container padding={padding}>
        <Stack gap="150">
          {hasHeader && (
            <Stack direction="row" align="center" justify="between">
              {title ? (
                <Typography
                  type="note"
                  mono
                  size="xs"
                  uppercase
                  tracking="widest"
                  variant="tertiary"
                >
                  <Typography
                    as="span"
                    type="note"
                    mono
                    size="xs"
                    tone="accent"
                    style={{ opacity: 0.8 }}
                  >
                    //
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
