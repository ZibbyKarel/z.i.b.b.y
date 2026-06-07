"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Container, Divider, Icon, Stack, StatusDot, Toggle, Typography } from "@zibby/design-system";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { useHealthQuery } from "../health/queries";

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

/** A mono key/value info row for the system panel. */
function InfoRow({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <Stack align="center" direction="row" gap="150" justify="between">
      <Typography mono size="sm" type="note" variant="tertiary">
        {label}
      </Typography>
      <Stack align="center" direction="row" gap="75">
        {tone === "ok" && <StatusDot pulse tone="ok" />}
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

export function Screen() {
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
    <PageContainer maxWidth="880px">
      <Stack gap="250">
        <PageHeader subtitle={`${DAEMON} · ${t("daemonOn")} ${HOST}`} title={t("title")} />

        <HudPanel padding="300" title={t("preferences")}>
          <Stack gap="200">
            <SettingRow
              control={
                <Stack direction="row" gap="50">
                  {(["cs", "en"] as const).map((l) => (
                    <Button
                      intent={locale === l ? "solid" : "ghost"}
                      key={l}
                      onClick={() => setLocale(l)}
                      size="sm"
                    >
                      {l === "cs" ? "Čeština" : "English"}
                    </Button>
                  ))}
                </Stack>
              }
              hint={t("languageHint")}
              label={t("language")}
            />
            <Divider />
            <SettingRow
              control={<Toggle checked={caffeinate} label={t("caffeinate")} onChange={setCaffeinateValue} />}
              hint={t("caffeinateHint")}
              label={t("caffeinate")}
            />
          </Stack>
        </HudPanel>

        <HudPanel padding="300" title={t("system")}>
          <Stack gap="150">
            <InfoRow label={t("daemon")} value={DAEMON} />
            <Divider />
            <InfoRow label={t("host")} value={HOST} />
            <Divider />
            <InfoRow label={t("uptime")} value={health ? formatUptime(health.uptime) : "—"} />
            <Divider />
            <InfoRow
              label={t("status")}
              tone={isSuccess ? "ok" : undefined}
              value={isSuccess ? t("online") : t("offline")}
            />
          </Stack>
        </HudPanel>

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
  );
}
