import type { ReactNode } from "react";
import {
  Card,
  CardProps,
  Container,
  GlassSurface,
  type Padding,
  Stack,
  Typography,
} from "@zibby/design-system";

export interface HudPanelProps {
  title?: string;
  action?: ReactNode;
  padding?: Padding;
  children?: ReactNode;
  /**
   * Live emphasis — tints the border and renders the HUD corner brackets.
   * Reserve for live content (running, awaiting approval, system alerts);
   * panels are matte by default. Only meaningful on the "hud" surface — the
   * "glass" surface has no tone/corners concept.
   */
  tone?: CardProps["tone"];
  /**
   * Make the tone emphasis *animate* — the shared {@link LivingGlow} pulse the
   * Chat-UI orb also uses. Reserve for genuinely in-flight panels; requires `tone`.
   * Only meaningful on the "hud" surface.
   */
  live?: boolean;
  /**
   * Visual language (D7, docs/hud2chat/DECISIONS.md): `"hud"` renders the
   * existing bordered `Card` (HUD corner brackets, tone glow); `"glass"` renders
   * the Velín-D `GlassSurface` treatment (gradient + backdrop blur) instead, for
   * pages migrated onto the immersive shell. The title/padding/children contract
   * is identical either way. Defaults to `"hud"` so every existing call site is
   * visually unchanged.
   */
  surface?: "hud" | "glass";
}

export function HudPanel({
  title,
  action,
  padding = "250",
  tone,
  live,
  surface = "hud",
  children,
}: HudPanelProps) {
  const hasHeader = Boolean(title || action);
  const body = (
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
  );

  if (surface === "glass") {
    return <GlassSurface radius="panel">{body}</GlassSurface>;
  }

  return (
    <Card corners={Boolean(tone)} living={Boolean(tone) && live} tone={tone}>
      {body}
    </Card>
  );
}
