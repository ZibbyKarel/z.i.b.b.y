import type { Route } from "next";
import { Container, IconTile, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActiveProject, useProjectsQuery } from "../../../features/projects";
import { BrandIcon } from "../../BrandIcon";
import { BrandName } from "../../BrandName";

/**
 * Sidebar brand mark. Static z.i.b.b.y wordmark by default; when a real project
 * is the active scope (Phase 25 — `useActiveProject()`, Phase 24), it swaps to
 * that project's own logo (falling back to a glyph tile when it has none) and
 * name, so the active engagement is unambiguous at a glance. "Bez projektu"
 * (`activeProjectId === null`) or an id no longer in the registry renders the
 * default brand unchanged.
 */
export function BrandLogo() {
  const t = useTranslations("sidebar");
  const tProjects = useTranslations("projects");
  const { activeProjectId } = useActiveProject();
  const { data: projects = [] } = useProjectsQuery();
  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : undefined;

  const href = (activeProject ? `/projects/${activeProject.id}` : "/overview") as Route;
  const ariaLabel = activeProject
    ? tProjects("scopeActive", { name: activeProject.name })
    : undefined;

  return (
    <Link aria-label={ariaLabel} href={href}>
      <Container padding={["0", "0", "200", "0"]} textAlign="center">
        <Stack align="center" justify="center">
          {/* De-glowed brand — light is reserved for live states. */}
          {activeProject ? (
            <IconTile
              alt={activeProject.name}
              glyph="code"
              shape="circle"
              size="lg"
              src={activeProject.logo}
            />
          ) : (
            <BrandIcon size={44} />
          )}
          <BrandName text={activeProject?.name} />
        </Stack>
        {!activeProject && (
          <Typography mono nowrap size="xs" tracking="tighter" type="note" variant="tertiary">
            {t("tagline")}
          </Typography>
        )}
      </Container>
    </Link>
  );
}
