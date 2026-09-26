"use client";

import {
  ButtonGroup,
  Container,
  Divider,
  Grid,
  Icon,
  Stack,
  StatusDot,
  SubNav,
  Toggle,
  Typography,
} from "@zibby/design-system";
import type { SubNavLinkComponent } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { useHealthQuery } from "../health";
import { LevelMappingSection } from "../roadmap/components/LevelMappingSection";
import { ActivitySection } from "./components/ActivitySection";
import { AppearanceSection } from "./components/AppearanceSection";
import { AutomationsSection } from "./components/AutomationsSection";
import { ChatSection } from "./components/ChatSection";
import { MachineSection } from "./components/MachineSection";
import { SystemSection } from "./components/SystemSection";
import { WatcherRows } from "./components/WatcherRows";
import { SETTINGS_SECTIONS, type SettingsSection } from "./settingsSections";

type Locale = "cs" | "en";

const DAEMON = "ZIBBY daemon";
const HOST = "Mac";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

/** A labelled preference row: title + hint on the left, a control on the right. */
function SettingRow({
  label,
  hint,
  control,
}: {
  label: string;
  hint?: string;
  control: React.ReactNode;
}) {
  return (
    <Stack align="center" direction="row" gap="250" justify="between">
      <Container minW0>
        <Stack gap="50">
          <Typography type="text" weight="medium">
            {label}
          </Typography>
          {hint && (
            <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
              {hint}
            </Typography>
          )}
        </Stack>
      </Container>
      <Container shrink={false}>{control}</Container>
    </Stack>
  );
}

/** A mono key/value info row for the status panel. */
function InfoRow({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <Stack align="center" direction="row" gap="150" justify="between">
      <Typography mono size="sm" type="note" variant="tertiary">
        {label}
      </Typography>
      <Stack align="center" direction="row" gap="75">
        {tone === "ok" && <StatusDot tone="ok" />}
        <Typography mono size="sm" tone={tone} type="note" weight="semibold">
          {value}
        </Typography>
      </Stack>
    </Stack>
  );
}

const CAFFEINATE_KEY = "zibby.caffeinate";

/** Module-scoped so the cookie write isn't analyzed as an in-render mutation. */
function writeLocaleCookie(value: Locale) {
  document.cookie = `locale=${value}; path=/; max-age=31536000`;
}

export interface SettingsScreenProps {
  section: SettingsSection;
}

/**
 * `/system/settings/[section]` (ZB-11, ROUTE-MAP §3) — the settings sections
 * router. Each former `/settings?tab=` is now its own route; the "gates" and
 * "mandate" tabs already moved to `/policy/gates` (ZB-08), "selfKnowledge" to
 * `/knowledge/distill` (ZB-09), and the per-project "tasks" level mapping to
 * `/work/projects/[id]/roadmap` (ZB-06) — only the GLOBAL DEFAULT level mapping
 * stays here, under `general`.
 */
export function SettingsScreen({ section }: SettingsScreenProps) {
  const t = useTranslations("settings");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { data: health, isSuccess } = useHealthQuery();

  const [caffeinate, setCaffeinate] = useState(() =>
    typeof window === "undefined" ? true : localStorage.getItem(CAFFEINATE_KEY) !== "false",
  );
  const setCaffeinateValue = (next: boolean) => {
    setCaffeinate(next);
    if (typeof window !== "undefined") localStorage.setItem(CAFFEINATE_KEY, String(next));
  };

  const setLocale = (value: Locale) => {
    writeLocaleCookie(value);
    router.refresh();
  };

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack direction="col" gap="250">
          <Stack align="baseline" direction="row" gap="150">
            <Typography mono size="sm" type="note" variant="tertiary">
              {t("eyebrow")}
            </Typography>
            <Typography type="title">{t("title")}</Typography>
          </Stack>

          <Grid gap="300" sidebar="left">
            <Container shrink={false}>
              <SubNav
                items={SETTINGS_SECTIONS.map((id) => ({
                  href: `/system/settings/${id}`,
                  label: t(`subnav.${id}`),
                  active: id === section,
                }))}
                linkComponent={Link as SubNavLinkComponent}
                orientation="responsive"
              />
            </Container>

            <Container grow minW0>
              {section === "general" && (
                <Stack gap="250">
                  <HudPanel padding="300" surface="glass" title={t("preferences")}>
                    <Stack gap="200">
                      <SettingRow
                        control={
                          <ButtonGroup
                            ariaLabel={t("language")}
                            onChange={(v) => setLocale(v as Locale)}
                            options={[
                              { id: "cs", label: "Čeština" },
                              { id: "en", label: "English" },
                            ]}
                            value={locale}
                          />
                        }
                        hint={t("languageHint")}
                        label={t("language")}
                      />
                      <Divider />
                      <SettingRow
                        control={
                          <Toggle
                            checked={caffeinate}
                            label={t("caffeinate")}
                            onChange={setCaffeinateValue}
                          />
                        }
                        hint={t("caffeinateHint")}
                        label={t("caffeinate")}
                      />
                    </Stack>
                  </HudPanel>
                  <LevelMappingSection surface="glass" />
                </Stack>
              )}

              {section === "appearance" && <AppearanceSection />}
              {section === "coo" && <ChatSection />}
              {section === "activity" && <ActivitySection />}
              {section === "automations" && <AutomationsSection />}
              {section === "runtime" && <SystemSection />}
              {section === "machine" && <MachineSection />}

              {section === "status" && (
                <HudPanel padding="300" surface="glass" title={t("system")}>
                  <Stack gap="150">
                    <InfoRow label={t("daemon")} value={DAEMON} />
                    <Divider />
                    <InfoRow label={t("host")} value={HOST} />
                    <Divider />
                    <InfoRow
                      label={t("uptime")}
                      value={health ? formatUptime(health.uptime) : "—"}
                    />
                    <Divider />
                    <InfoRow
                      label={t("status")}
                      tone={isSuccess ? "ok" : undefined}
                      value={isSuccess ? t("online") : t("offline")}
                    />
                    {health?.watchers && health.watchers.length > 0 && (
                      <>
                        <Divider />
                        <WatcherRows watchers={health.watchers} />
                      </>
                    )}
                  </Stack>
                </HudPanel>
              )}
            </Container>
          </Grid>

          <Stack align="center">
            <Stack align="center" direction="row" gap="75">
              <Icon name="butlerSign" size="sm" tone="faint" />
              <Typography mono size="2xs" type="note" variant="tertiary">
                {t("footer")}
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      </PageContainer>
    </Container>
  );
}
