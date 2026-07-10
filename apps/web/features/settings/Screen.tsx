"use client";

import {
  ButtonGroup,
  Container,
  Divider,
  Icon,
  Stack,
  StatusDot,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Toggle,
  Typography,
} from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { useHealthQuery } from "../health";
import { GateRulesSection } from "../gates/components/GateRulesSection";
import { ActivitySection } from "./components/ActivitySection";
import { AutomationsSection } from "./components/AutomationsSection";
import { ChatSection } from "./components/ChatSection";
import { MachineSection } from "./components/MachineSection";
import { MandateSection } from "./components/MandateSection";
import { ResearchSection } from "./components/ResearchSection";
import { SelfKnowledgeSection } from "./components/SelfKnowledgeSection";
import { SystemSection } from "./components/SystemSection";

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
    <PageContainer>
      <Stack gap="250">
        <PageHeader subtitle={`${DAEMON} · ${t("daemonOn")} ${HOST}`} title={t("title")} />

        <Tabs defaultValue="preferences" direction="vertical">
          <TabList>
            <Tab value="preferences">{t("preferences")}</Tab>
            <Tab value="gates">{t("subnav.gates")}</Tab>
            <Tab value="automations">{t("automations.title")}</Tab>
            <Tab value="chat">{t("chat.title")}</Tab>
            <Tab value="activity">{t("activity.title")}</Tab>
            <Tab value="mandate">{t("mandate.title")}</Tab>
            <Tab value="research">{t("research.title")}</Tab>
            <Tab value="runtime">{t("runtime.title")}</Tab>
            <Tab value="machine">{t("machine.title")}</Tab>
            <Tab value="selfKnowledge">{t("selfKnowledge.title")}</Tab>
            <Tab value="system">{t("system")}</Tab>
          </TabList>

          <TabPanel value="preferences">
            <HudPanel padding="300" title={t("preferences")}>
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
          </TabPanel>

          <TabPanel value="gates">
            <GateRulesSection />
          </TabPanel>

          <TabPanel value="automations">
            <AutomationsSection />
          </TabPanel>

          <TabPanel value="chat">
            <ChatSection />
          </TabPanel>

          <TabPanel value="activity">
            <ActivitySection />
          </TabPanel>

          <TabPanel value="mandate">
            <MandateSection />
          </TabPanel>

          <TabPanel value="research">
            <ResearchSection />
          </TabPanel>

          <TabPanel value="runtime">
            <SystemSection />
          </TabPanel>

          <TabPanel value="machine">
            <MachineSection />
          </TabPanel>

          <TabPanel value="selfKnowledge">
            <SelfKnowledgeSection />
          </TabPanel>

          <TabPanel value="system">
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
          </TabPanel>
        </Tabs>

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
