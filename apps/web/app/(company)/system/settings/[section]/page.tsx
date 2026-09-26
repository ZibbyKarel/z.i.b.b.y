import { notFound } from "next/navigation";
import { SettingsScreen } from "../../../../../features/settings/Screen";
import {
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "../../../../../features/settings/settingsSections";

function isSettingsSection(value: string): value is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isSettingsSection(section)) notFound();
  return <SettingsScreen section={section} />;
}
