"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { SectionToolbar } from "../../components/SectionToolbar/SectionToolbar";
import { Collection } from "../../components/Collection/Collection";
import { EntityFormModal } from "../../components/EntityFormModal/EntityFormModal";
import { IntegrationCard } from "./components/IntegrationCard";
import { useEntityForm } from "../../state/forms";
import { useCatalog } from "../../state/store";

export function Screen() {
  const t = useTranslations();
  const { integrations, addIntegration } = useCatalog();
  const [adding, setAdding] = useState(false);
  const form = useEntityForm("integration");

  return (
    <PageContainer>
      <SectionToolbar
        addLabel={t("integrations.addIntegration")}
        label={t("integrations.sectionLabel")}
        onAdd={() => setAdding(true)}
      />

      <Collection
        empty={{
          glyph: "plug",
          title: t("integrations.emptyTitle"),
          description: t("integrations.emptyDescription"),
          actionLabel: t("integrations.addIntegration"),
          hint: t("integrations.emptyHint"),
          onAction: () => setAdding(true),
        }}
        items={integrations}
        renderItem={(i) => <IntegrationCard integration={i} key={i.id} />}
      />

      {adding && (
        <EntityFormModal
          fields={form.fields}
          filePreview={form.filePreview}
          glyph={form.glyph}
          onClose={() => setAdding(false)}
          onSubmit={(values) => {
            addIntegration(values, t("defaults.integration"));
            setAdding(false);
          }}
          submitLabel={form.submitLabel}
          subtitle={form.subtitle}
          title={form.title}
        />
      )}
    </PageContainer>
  );
}
