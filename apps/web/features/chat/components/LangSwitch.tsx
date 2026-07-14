"use client";

import { ButtonGroup, GlassSurface } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export enum LangSwitchTestId {
  Root = "chat-lang-switch",
}

type Locale = "cs" | "en";

function isLocale(value: string): value is Locale {
  return value === "cs" || value === "en";
}

/** Module-scoped so the cookie write isn't analysed as an in-render mutation
 * (same pattern as features/settings/Screen.tsx). */
function writeLocaleCookie(value: Locale) {
  document.cookie = `locale=${value}; path=/; max-age=31536000`;
}

/** Glass-pill language switch. Reuses the settings locale mechanism exactly:
 * cookie write + router.refresh() so i18n/request.ts re-reads on the next render.
 * ButtonGroup emits "" when the active option is toggled off — guarded, no-op. */
export function LangSwitch() {
  // Reuses the shipped top-bar label key — no new catalog entry.
  const t = useTranslations("topbar");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const setLocale = (value: string) => {
    if (!isLocale(value) || value === locale) return;
    writeLocaleCookie(value);
    router.refresh();
  };

  return (
    <GlassSurface data-testid={LangSwitchTestId.Root} radius="pill">
      <ButtonGroup
        ariaLabel={t("langSwitcherLabel")}
        onChange={setLocale}
        options={[
          { id: "cs", label: "Čeština" },
          { id: "en", label: "English" },
        ]}
        value={locale}
      />
    </GlassSurface>
  );
}
