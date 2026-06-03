import type { ReactNode } from "react";
import { Container, Stack, Typography } from "@zibby/design-system";
import { HudPanel } from "../HudPanel/HudPanel";

export interface PageHeaderProps {
  title: string;
  /** Secondary mono line under the title — e.g. a count summary. */
  subtitle?: string;
  /** Right-aligned action cluster (buttons). */
  actions?: ReactNode;
}

/**
 * The page-level HUD header: a panel with a large title, an optional mono
 * subtitle and a right-aligned action cluster. Extracted from the agents screen
 * header — the repeated `HudPanel` title/subtitle/actions block.
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <HudPanel padding="300">
      <Stack wrap align="start" direction="row" gap="200" justify="between">
        <Container minW0>
          <Stack gap="75">
            <Typography
              leading="tight"
              tracking="tighter"
              type="pageTitle"
              weight="semibold"
            >
              {title}
            </Typography>
            {subtitle && (
              <Typography mono size="sm" type="note" variant="tertiary">
                {subtitle}
              </Typography>
            )}
          </Stack>
        </Container>
        {actions && (
          <Stack align="center" direction="row" gap="100">
            {actions}
          </Stack>
        )}
      </Stack>
    </HudPanel>
  );
}
