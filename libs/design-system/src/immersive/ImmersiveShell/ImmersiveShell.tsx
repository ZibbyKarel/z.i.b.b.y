import type { ReactNode } from "react";
import { Container } from "../../components/Container/Container";
import { Stack } from "../../components/Stack/Stack";
import { Typography } from "../../components/Typography/Typography";
import { GlassSurface } from "../GlassSurface/GlassSurface";

export enum ImmersiveShellTestId {
  Root = "immersive-shell-root",
  Header = "immersive-shell-header",
  Back = "immersive-shell-back",
  Title = "immersive-shell-title",
  Subtitle = "immersive-shell-subtitle",
  Actions = "immersive-shell-actions",
  Body = "immersive-shell-body",
}

export interface ImmersiveShellProps {
  /** Page title, shown in the header band. */
  title: string;
  /** Muted one-liner under the title. */
  subtitle?: string;
  /**
   * The back affordance, rendered inside the header's leading round 34px slot.
   * DS must not import `next/link` — the app supplies the actual link (see
   * `apps/web/components/layout/ImmersivePage`, the thin wrapper every call
   * site uses).
   */
  backSlot?: ReactNode;
  /** Right-aligned actions cluster in the header. */
  actions?: ReactNode;
  /** The page body. */
  children: ReactNode;
}

/**
 * The reusable full-page chrome every migrated HUD section adopts (D1,
 * `docs/hud2chat/DECISIONS.md`): a scene backdrop, a thin glass header (round
 * back-to-orb button + title/subtitle + a right-aligned actions cluster), and
 * a scrollable content frame. Deliberately **no** orb map, dock, rail or
 * bottombar — those stay `/chat`-only (see the Archiv úloh sub-page chrome
 * contract the plan is built from).
 *
 * The backdrop radial-gradient matches `ChatScreen`'s bespoke vignette values
 * exactly (ellipse 130% 100% at 50% 42%, `#121a27` → `--color-background` at
 * 62%) so every immersive surface shares one visual language. The
 * scanline/grid textures layered on top of that gradient in `ChatScreen` are
 * orb-map ambience, not core chrome, and are deliberately not reproduced here.
 */
export function ImmersiveShell({
  title,
  subtitle,
  backSlot,
  actions,
  children,
}: ImmersiveShellProps) {
  return (
    <Stack
      data-testid={ImmersiveShellTestId.Root}
      direction="col"
      style={{ height: "100dvh", overflow: "hidden", position: "relative" }}
    >
      {/* The immersive scene backdrop — see the class-note above for why the
          values are hand-matched to ChatScreen rather than imported from it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[image:radial-gradient(ellipse_130%_100%_at_50%_42%,#121a27_0%,var(--color-background)_62%)]"
      />

      <GlassSurface
        data-testid={ImmersiveShellTestId.Header}
        radius="none"
        style={{
          flex: "0 0 auto",
          position: "relative",
          zIndex: 10,
          // A full-bleed band, not a floating card: square corners, and only the
          // bottom hairline survives (the design's Archiv úloh header is exactly
          // a `borderBottom` rule). The side/top borders would otherwise sit on
          // the viewport edges as stray hairlines.
          borderTop: "none",
          borderLeft: "none",
          borderRight: "none",
        }}
      >
        <Container padding={["200", "300"]}>
          <Stack align="center" as="header" direction="row" gap="200">
            {backSlot && (
              <div
                className="flex size-[34px] shrink-0 items-center justify-center rounded border border-accent/30 bg-accent-dim text-accent"
                data-testid={ImmersiveShellTestId.Back}
              >
                {backSlot}
              </div>
            )}
            <Container grow minW0>
              <Stack direction="col" gap="25">
                <Typography truncate data-testid={ImmersiveShellTestId.Title} type="title">
                  {title}
                </Typography>
                {subtitle && (
                  <Typography truncate data-testid={ImmersiveShellTestId.Subtitle} type="note">
                    {subtitle}
                  </Typography>
                )}
              </Stack>
            </Container>
            {actions && (
              <Stack
                align="center"
                data-testid={ImmersiveShellTestId.Actions}
                direction="row"
                gap="100"
              >
                {actions}
              </Stack>
            )}
          </Stack>
        </Container>
      </GlassSurface>

      <Container
        grow
        data-testid={ImmersiveShellTestId.Body}
        minHeight="0"
        overflow="auto"
        style={{ position: "relative", zIndex: 10 }}
      >
        {children}
      </Container>
    </Stack>
  );
}
