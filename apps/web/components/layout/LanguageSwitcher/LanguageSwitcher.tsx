"use client";
import { Dropdown, type DropdownOption } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type Locale = "cs" | "en";

const LANG_OPTIONS: DropdownOption<Locale>[] = [
  { value: "cs", label: "Čeština", code: "CZ" },
  { value: "en", label: "English", code: "EN" },
];

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const t = useTranslations("topbar");

  const handleChange = (value: Locale) => {
    document.cookie = `locale=${value}; path=/; max-age=31536000`;
    router.refresh();
  };

  return (
    <Dropdown
      aria-label={t("langSwitcherLabel")}
      onChange={handleChange}
      options={LANG_OPTIONS}
      value={locale}
    />
  );
}
