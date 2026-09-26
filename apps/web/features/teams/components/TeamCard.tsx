import type { Team } from "@zibby/contracts";
import { EntityCard, Tag } from "@zibby/design-system";
import { useTranslations } from "next-intl";

export interface TeamCardProps {
  team: Team;
  onOpen?: (team: Team) => void;
}

/**
 * Catalog card for a single team — a thin container over the generic
 * {@link EntityCard}, mirroring `CompanyCard`. A team has no roster or budget of
 * its own (those stay company-only); its one distinguishing badge is whether a
 * read-only knowledge base is attached.
 */
export function TeamCard({ team, onOpen }: TeamCardProps) {
  const t = useTranslations("teams");
  const hasKnowledgeBase = team.knowledgeBase != null;

  return (
    <EntityCard
      badges={[
        [
          hasKnowledgeBase ? (
            <Tag key="kb" tone="accent">
              {t("hasKnowledgeBase")}
            </Tag>
          ) : null,
        ],
      ]}
      description={team.desc}
      glyph="grid"
      onClick={() => onOpen?.(team)}
      openLabel={t("openAria", { name: team.name })}
      subtitle={team.id}
      title={team.name}
    />
  );
}
