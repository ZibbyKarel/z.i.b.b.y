import type { ReactNode } from "react";
import { Card, CardProps, Container, type Padding, Stack, Typography } from "@zibby/design-system";

export interface HudPanelProps {
  title?: string;
  action?: ReactNode;
  padding?: Padding;
  children?: ReactNode;
  /**
   * Live emphasis — tints the border and renders the HUD corner brackets.
   * Reserve for live content (running, awaiting approval, system alerts);
   * panels are matte by default.
   */
  tone?: CardProps["tone"];
  /**
   * Make the tone emphasis *animate* — the shared {@link LivingGlow} pulse the
   * Chat-UI orb also uses. Reserve for genuinely in-flight panels; requires `tone`.
   */
  live?: boolean;
}

export function HudPanel({ title, action, padding = "250", tone, live, children }: HudPanelProps) {
  const hasHeader = Boolean(title || action);
  return (
    <Card corners={Boolean(tone)} living={Boolean(tone) && live} tone={tone}>
      <Container padding={padding}>
        <Stack gap="150">
          {hasHeader && (
            <Stack align="center" direction="row" justify="between">
              {title ? <Typography type="label">{title}</Typography> : <span />}
              {action}
            </Stack>
          )}
          {children}
        </Stack>
      </Container>
    </Card>
  );
}
