import {
  Button,
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
  onRun: (skill: Skill) => void;
}

export function SkillTile({ skill, onRun }: SkillTileProps) {
  return (
    <Card interactive corners radius="sm">
      <Container padding="150">
        <Stack gap="150">
          <Stack direction="row" align="start" gap="150">
            <IconTile glyph={skill.glyph} size="md" />
            <Container grow minW0>
              <Stack gap="25">
                <Typography type="note" mono weight="semibold" size="md" truncate>
                  {skill.name}
                </Typography>
                <Typography
                  type="note"
                  variant="secondary"
                  size="caption"
                  leading="snug"
                >
                  {skill.desc}
                </Typography>
              </Stack>
            </Container>
            <StatusDot tone="faint" size="75" />
          </Stack>

          <Stack direction="row" align="center" justify="between">
            <Container maxWidth="130px" minW0>
              <Typography type="note" mono size="xs" variant="tertiary" truncate>
                {skill.file.replace("~/zibby/skills/", "")}
              </Typography>
            </Container>
            <Button intent="run" size="sm" icon="play" onClick={() => onRun(skill)}>
              Spustit
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
