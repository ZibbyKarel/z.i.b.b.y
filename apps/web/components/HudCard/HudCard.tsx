import { Fragment, type ReactNode } from "react";
import {
  Card,
  Container,
  Divider,
  type IconName,
  IconTile,
  Pressable,
  Stack,
  Typography,
} from "@zibby/design-system";

export interface HudCardProps {
  /** Mono title shown next to the glyph. Truncated to a single line. */
  title: string;
  /** Icon rendered in the leading tile. Defaults to "bot". */
  glyph?: IconName;
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
  onOpen?: () => void;
  /** Accessible label for the open target. */
  openLabel?: string;
  /** Footer content (typically buttons), rendered under a divider. */
  actions?: ReactNode;
}

/**
 * Presentational dashboard card: leading glyph, mono title + clamped
 * description, wrapping badge rows and a footer action slot. Dumb by design —
 * all labels and behaviour come in as props (see AgentCard for a live caller).
 */
export function HudCard({
  title,
  glyph,
  subtitle,
  description,
  aside,
  badges,
  onOpen,
  openLabel,
  actions,
}: HudCardProps) {
  const rows = (badges ?? []).filter((row) => row.some(Boolean));

  const body = (
    <Container textAlign="left">
      <Stack gap="150">
        <Stack align="start" direction="row" gap="150">
          <IconTile glyph={glyph ?? "bot"} size="md" />
          <Container grow minW0>
            <Stack gap="25">
              <Typography mono truncate size="md" type="note" weight="semibold">
                {title}
              </Typography>
              {subtitle != null && subtitle !== "" && (
                <Typography mono truncate size="caption" type="note" variant="tertiary">
                  {subtitle}
                </Typography>
              )}
              {description != null && description !== "" && (
                <>
                  {/* 2-line clamp: -webkit-line-clamp has no DS equivalent. */}
                  {/* eslint-disable-next-line react/forbid-dom-props */}
                  <div style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    <Typography leading="snug" size="caption" type="note" variant="secondary">
                      {description}
                    </Typography>
                  </div>
                </>
              )}
            </Stack>
          </Container>
          {aside}
        </Stack>

        {rows.map((row, i) => (
          // Badge rows are positional and stable; index keys are appropriate.
          <Stack wrap direction="row" gap="75" key={i}>
            {row.map((node, j) => (
              <Fragment key={j}>{node}</Fragment>
            ))}
          </Stack>
        ))}
      </Stack>
    </Container>
  );

  return (
    <Card interactive>
      <Container padding="150" position="relative">
        <Stack gap="150">
          {onOpen ? (
            <Pressable aria-label={openLabel} onClick={onOpen}>
              {body}
            </Pressable>
          ) : (
            body
          )}

          {actions != null && (
            <>
              <Divider />
              {actions}
            </>
          )}
        </Stack>
      </Container>
    </Card>
  );
}
