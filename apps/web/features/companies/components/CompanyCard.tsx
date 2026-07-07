import type { Company } from "@zibby/contracts";
import { Tag } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudCard } from "../../../components/HudCard/HudCard";

export interface CompanyCardProps {
  company: Company;
  onOpen?: (company: Company) => void;
}

/**
 * Catalog card for a single company (firma) — a thin container over the generic
 * {@link HudCard}, mirroring `ProjectCard`. A company has no runs of its own (it
 * is a super-entity above Project, Phase 68), so the footer only surfaces the
 * roster size and whether a default budget is set — no live run/cost bars.
 */
export function CompanyCard({ company, onOpen }: CompanyCardProps) {
  const t = useTranslations("companies");
  const peopleCount = company.people?.length ?? 0;
  const hasBudget = company.budget != null;

  return (
    <HudCard
      badges={[
        [
          peopleCount > 0 ? (
            <Tag key="people" tone="neutral">
              {t("peopleCount", { count: peopleCount })}
            </Tag>
          ) : null,
          hasBudget ? (
            <Tag key="budget" tone="accent">
              {t("hasBudget")}
            </Tag>
          ) : null,
        ],
      ]}
      description={company.desc}
      glyph="branch"
      onClick={() => onOpen?.(company)}
      openLabel={t("openAria", { name: company.name })}
      subtitle={company.id}
      title={company.name}
    />
  );
}
