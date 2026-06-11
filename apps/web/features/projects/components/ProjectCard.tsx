import type { Project } from "@zibby/contracts";
import { Tag } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudCard } from "../../../components/HudCard/HudCard";

export interface ProjectCardProps {
  project: Project;
  onOpen?: (project: Project) => void;
}

/**
 * Catalog card for a single project (target directory): a thin container over
 * the generic {@link HudCard} — a code IconTile, the project name and its
 * on-disk path, an optional description and category. The whole card opens
 * the editor.
 */
export function ProjectCard({ project, onOpen }: ProjectCardProps) {
  const t = useTranslations("projects");

  return (
    <HudCard
      badges={
        project.category
          ? [
              [
                <Tag key="cat" tone="neutral">
                  {project.category}
                </Tag>,
              ],
            ]
          : undefined
      }
      description={project.desc}
      glyph="code"
      onClick={() => onOpen?.(project)}
      openLabel={t("openAria", { name: project.name })}
      subtitle={project.path}
      title={project.name}
    />
  );
}
