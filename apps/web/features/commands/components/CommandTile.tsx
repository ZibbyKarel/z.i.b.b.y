import {
  Card,
  Container,
  IconTile,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import type { Command } from "@zibby/contracts";

export interface CommandTileProps {
  command: Command;
  /** Open the command for editing (and delete). When omitted the tile is static. */
  onSelect?: () => void;
  /** Accessible name for the clickable tile (e.g. "Edit command X"). */
  selectLabel?: string;
}

/**
 * Catalog entry for a custom slash command. Mirrors {@link SkillTile}: a glyph,
 * the command description, and — instead of a file path — the `/<id>` slash name
 * the operator types to invoke it. Clicking it opens the editor.
 */
export function CommandTile({ command, onSelect, selectLabel }: CommandTileProps) {
  return (
    <Card
      interactive
      aria-label={onSelect ? selectLabel : undefined}
      as={onSelect ? "button" : "div"}
      onClick={onSelect}
    >
      <Container padding="150">
        <Stack gap="150">
          <Stack align="start" direction="row" gap="150">
            <IconTile glyph="bolt" size="md" />
            <Container grow minW0>
              <Stack gap="25">
                <Typography mono truncate size="md" type="note" weight="semibold">
                  {`/${command.id}`}
                </Typography>
                <Typography leading="snug" size="caption" type="note" variant="secondary">
                  {command.description}
                </Typography>
              </Stack>
            </Container>
            <StatusDot size="75" tone={command.enabled ? "ok" : "idle"} />
          </Stack>

          {command["argument-hint"] && (
            <Container minW0>
              <Typography mono truncate size="xs" type="note" variant="tertiary">
                {command["argument-hint"]}
              </Typography>
            </Container>
          )}
        </Stack>
      </Container>
    </Card>
  );
}
