import { useTranslations } from "next-intl";
import {
  Card,
  Chip,
  Container,
  Divider,
  Icon,
  IconTile,
  Pressable,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { Project } from "@zibby/contracts";

export interface ProjectCardProps {
  project: Project;
  onOpen?: (project: Project) => void;
}

/**
 * Catalog card for a single project (target directory). Mirrors `AgentCard`'s
 * shape: a code IconTile, the project name and its on-disk path, an optional
 * 2-line description, and a footer chip carrying the work/home context. The whole
 * card opens the editor.
 */
export function ProjectCard({ project, onOpen }: ProjectCardProps) {
  const t = useTranslations("projects");

  return (
    <Card corners interactive radius="sm">
      <Container padding="150" position="relative">
        <Pressable aria-label={t("openAria", { name: project.name })} onClick={() => onOpen?.(project)}>
          <Container textAlign="left">
            <Stack gap="150">
              <Stack align="start" direction="row" gap="150">
                <IconTile glyph="code" size="md" />
                <Container grow minW0>
                  <Stack gap="25">
                    <Typography mono truncate size="md" type="note" weight="semibold">
                      {project.name}
                    </Typography>
                    <Typography mono truncate size="caption" type="note" variant="tertiary">
                      {project.path}
                    </Typography>
                  </Stack>
                </Container>
              </Stack>

              {project.desc && (
                <Typography leading="snug" size="caption" type="note" variant="secondary">
                  {project.desc}
                </Typography>
              )}

              <Divider />

              <Stack align="center" direction="row" gap="100">
                <Chip tone={project.ctx === "home" ? "neutral" : "accent"}>
                  <Icon name={project.ctx === "home" ? "coffee" : "code"} size="xs" /> {project.ctx}
                </Chip>
              </Stack>
            </Stack>
          </Container>
        </Pressable>
      </Container>
    </Card>
  );
}
