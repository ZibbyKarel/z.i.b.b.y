import { Fragment, type ReactNode } from "react";
import { Card } from "../Card/Card";
import { Container } from "../Container/Container";
import { Divider } from "../Divider/Divider";
import { IconTile, type IconTileSize } from "../IconTile/IconTile";
import type { IconName } from "../Icon/Icon";
import { Pressable } from "../Pressable/Pressable";
import { Stack } from "../Stack/Stack";
import { Typography } from "../Typography/Typography";

export enum EntityCardTestId {
  Root = "entity-card-root",
  Glyph = "entity-card-glyph",
  Title = "entity-card-title",
  Subtitle = "entity-card-subtitle",
  Description = "entity-card-description",
  Aside = "entity-card-aside",
  /** Prefixed with the row index — see the SKILL.md "repeated parts" convention. */
  BadgeRow = "entity-card-badge-row",
  Open = "entity-card-open",
  Actions = "entity-card-actions",
}

export interface EntityCardProps {
  /** Mono title shown next to the glyph. Truncated to a single line. */
  title: string;
  /** Icon rendered in the leading tile. Defaults to "bot". */
  glyph?: IconName;
  /** Size of the leading avatar tile. Defaults to "md". */
  avatarSize?: IconTileSize;
  /** Custom logo (data URI) shown in the leading tile instead of the glyph; falls
   * back to the glyph automatically when absent or when it fails to load. */
  logoSrc?: string;
  /** Accessible alt text for `logoSrc`; defaults to `title`. */
  logoAlt?: string;
  /** Mono meta line right under the title (a path, an id…), single-line truncated. */
  subtitle?: string;
  /** Secondary text under the title, clamped to two lines. */
  description?: ReactNode;
  /** Trailing node in the header row (a status chip…), aligned to the top right. */
  aside?: ReactNode;
  /**
   * Rows of badges. Each inner array wraps onto its own line; rows that hold
   * no truthy node are skipped, so callers can pass conditional chips inline.
   */
  badges?: ReactNode[][];
  /** When set, the body becomes a clickable target (opens / inspects). */
  onClick?: () => void;
  /** Accessible label for the open target. */
  openLabel?: string;
  /** Footer content (typically buttons), rendered under a hairline. */
  actions?: ReactNode;
}

/**
 * The catalog list-item card (ZibbyCorp DS shape — square corners, hairline
 * border, mono labels): a leading glyph tile, mono title + clamped
 * description, wrapping badge rows and a footer action slot. Dumb by design —
 * all labels and behaviour come in as props (see `AgentCard` in the app for a
 * live caller). Replaces the app-level `HudCard` (ZB-13).
 */
export function EntityCard({
  title,
  glyph,
  avatarSize = "md",
  logoSrc,
  logoAlt,
  subtitle,
  description,
  aside,
  badges,
  onClick,
  openLabel,
  actions,
}: EntityCardProps) {
  const rows = (badges ?? []).filter((row) => row.some(Boolean));

  const body = (
    <Container textAlign="left">
      <Stack gap="150">
        <Stack align="start" direction="row" gap="150">
          <span data-testid={EntityCardTestId.Glyph}>
            <IconTile
              alt={logoAlt ?? title}
              glyph={glyph ?? "bot"}
              size={avatarSize}
              src={logoSrc}
            />
          </span>
          <Container grow minW0>
            <Stack gap="25">
              <Typography
                mono
                truncate
                data-testid={EntityCardTestId.Title}
                size="md"
                type="note"
                weight="semibold"
              >
                {title}
              </Typography>
              {subtitle != null && subtitle !== "" && (
                <Typography
                  mono
                  truncate
                  data-testid={EntityCardTestId.Subtitle}
                  size="caption"
                  type="note"
                  variant="tertiary"
                >
                  {subtitle}
                </Typography>
              )}
              {description != null && description !== "" && (
                <div className="line-clamp-2">
                  <Typography
                    data-testid={EntityCardTestId.Description}
                    leading="snug"
                    size="caption"
                    type="note"
                    variant="secondary"
                  >
                    {description}
                  </Typography>
                </div>
              )}
            </Stack>
          </Container>
          {aside && <span data-testid={EntityCardTestId.Aside}>{aside}</span>}
        </Stack>

        {rows.map((row, i) => (
          // Badge rows are positional and stable; index keys are appropriate.
          <Stack
            wrap
            data-testid={`${EntityCardTestId.BadgeRow}-${i}`}
            direction="row"
            gap="75"
            key={i}
          >
            {row.map((node, j) => (
              <Fragment key={j}>{node}</Fragment>
            ))}
          </Stack>
        ))}
      </Stack>
    </Container>
  );

  return (
    <Card interactive background="panel" data-testid={EntityCardTestId.Root} radius="none">
      <Container padding="150" position="relative">
        <Stack gap="150">
          {onClick ? (
            <Pressable aria-label={openLabel} data-testid={EntityCardTestId.Open} onClick={onClick}>
              {body}
            </Pressable>
          ) : (
            body
          )}

          {actions != null && (
            <>
              <Divider />
              <span data-testid={EntityCardTestId.Actions}>{actions}</span>
            </>
          )}
        </Stack>
      </Container>
    </Card>
  );
}
