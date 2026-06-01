import { useTranslations } from "next-intl";
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
  const t = useTranslations("skills");
  return (
    <Card corners interactive radius="sm">
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
            <StatusDot size="75" tone="faint" />
          </Stack>

          <Stack align="center" direction="row" justify="between">
            <Container minW0 maxWidth="130px">
              <Typography mono truncate size="xs" type="note" variant="tertiary">
                {skill.file.replace("~/zibby/skills/", "")}
              </Typography>
            </Container>
            <Button icon="play" intent="run" onClick={() => onRun(skill)} size="sm">
              {t("runButton")}
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
