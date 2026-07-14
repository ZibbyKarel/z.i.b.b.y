"use client";

import { Dropdown } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type Locale = "cs" | "en";

function isLocale(value: string): value is Locale {
  return value === "cs" || value === "en";
}

/** Module-scoped so the cookie write isn't analysed as an in-render mutation
 * (same pattern as features/settings/Screen.tsx). */
function writeLocaleCookie(value: Locale) {
  document.cookie = `locale=${value}; path=/; max-age=31536000`;
}

/**
 * Compact code-only language switch (Velín-D top bar): a DS `Dropdown` (inline,
 * size sm, compact — CZ/EN, accent border + chevron on open). No wrapping
 * GlassSurface — the top bar supplies the single glass layer (the phase-2 double
 * glass nesting is gone). Locale mechanics unchanged: cookie write + router.refresh()
 * so i18n/request.ts re-reads on the next render.
 */
export function LangSwitch() {
  const t = useTranslations("topbar");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const setLocale = (value: string) => {
    if (!isLocale(value) || value === locale) return;
    writeLocaleCookie(value);
    router.refresh();
  };

  return (
    <Dropdown
      compact
      aria-label={t("langSwitcherLabel")}
      onChange={setLocale}
      options={[
        { value: "cs", code: "CZ", label: "Čeština" },
        { value: "en", code: "EN", label: "English" },
      ]}
      size="sm"
      value={locale}
      variant="inline"
    />
  );
}
