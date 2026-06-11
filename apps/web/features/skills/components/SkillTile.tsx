import {
  Card,
  Container,
  IconTile,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import type { Skill } from "../../../domain";

export interface SkillTileProps {
  skill: Skill;
}

// A skill is a capability an agent invokes, not something you run on its own, so
// the tile is a catalog entry — no "Run" affordance.
export function SkillTile({ skill }: SkillTileProps) {
  return (
    <Card interactive>
      <Container padding="150">
        <Stack gap="150">
          <Stack align="start" direction="row" gap="150">
            <IconTile glyph={skill.glyph} size="md" />
            <Container grow minW0>
              <Stack gap="25">
                <Typography mono truncate size="md" type="note" weight="semibold">
                  {skill.name}
                </Typography>
                <Typography
                  leading="snug"
                  size="caption"
                  type="note"
                  variant="secondary"
                >
                  {skill.desc}
                </Typography>
              </Stack>
            </Container>
            <StatusDot size="75" tone="idle" />
          </Stack>

          <Container minW0>
            <Typography mono truncate size="xs" type="note" variant="tertiary">
              {skill.file.replace("~/zibby/skills/", "")}
            </Typography>
          </Container>
        </Stack>
      </Container>
    </Card>
  );
}
