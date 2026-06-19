"use client";

import { ButtonGroup } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

const SECTIONS = [
  { id: "general", href: "/settings" },
  { id: "gates", href: "/gates" },
] as const;

/**
 * Secondary settings navigation — "Obecné" and "Pravidla schvalování" are two
 * sections of one settings area (the gate rules lost their sidebar entry).
 * Rendered under the page header of both screens.
 */
export function SettingsSubnav() {
  const t = useTranslations("settings.subnav");
  const router = useRouter();
  const pathname = usePathname();
  const active = SECTIONS.find((s) => pathname.startsWith(s.href))?.id ?? "general";

  return (
    <ButtonGroup
      ariaLabel={t("ariaLabel")}
      onChange={(id) => {
        const section = SECTIONS.find((s) => s.id === id);
        if (section && section.id !== active) router.push(section.href);
      }}
      options={SECTIONS.map((s) => ({ id: s.id, label: t(s.id) }))}
      value={active}
    />
  );
}
