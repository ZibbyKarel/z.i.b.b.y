import { useTranslations } from "next-intl";
import { Chip, Icon, Stack } from "@zibby/design-system";
import type { Project } from "@zibby/contracts";
import { HudCard } from "../../../components/HudCard/HudCard";

export interface ProjectCardProps {
  project: Project;
  onOpen?: (project: Project) => void;
}

/**
 * Catalog card for a single project (target directory): a thin container over
 * the generic {@link HudCard} — a code IconTile, the project name and its
 * on-disk path, an optional description, and a footer chip carrying the
 * work/home context. The whole card opens the editor.
 */
export function ProjectCard({ project, onOpen }: ProjectCardProps) {
  const t = useTranslations("projects");

  return (
    <HudCard
      actions={
        <Stack align="center" direction="row" gap="100">
          <Chip tone={project.ctx === "home" ? "neutral" : "accent"}>
            <Icon name={project.ctx === "home" ? "coffee" : "code"} size="xs" /> {project.ctx}
          </Chip>
        </Stack>
      }
      description={project.desc}
      glyph="code"
      onOpen={() => onOpen?.(project)}
      openLabel={t("openAria", { name: project.name })}
      subtitle={project.path}
      title={project.name}
    />
  );
}
