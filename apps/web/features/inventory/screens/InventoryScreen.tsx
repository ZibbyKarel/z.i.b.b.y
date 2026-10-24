"use client";

import type {
  InventoryCatalogEntry,
  InventoryMcpServer,
  InventoryPlugin,
  InventorySkill,
} from "@zibby/contracts";
import {
  Button,
  Container,
  DataTable,
  type DataTableColumn,
  SectionLabel,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";

import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { QueryError } from "../../../components/LoadError/QueryError";
import { useInstallSkillMutation } from "../mutations";
import { useInventoryQuery } from "../queries";

export enum InventoryScreenTestId {
  Catalog = "inventory-catalog",
  CatalogRow = "inventory-catalog-row",
  Install = "inventory-install",
  RowError = "inventory-row-error",
  Mcp = "inventory-mcp",
  Skills = "inventory-skills",
  Plugins = "inventory-plugins",
  Refresh = "inventory-refresh",
  Empty = "inventory-empty",
}

const STATUS_TONE = {
  "not-installed": "neutral",
  installed: "ok",
  outdated: "warn",
  conflict: "bad",
} as const;

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const body = (error as { body?: unknown }).body;
    if (typeof body === "object" && body !== null) {
      const message = (body as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

function Section({
  testId,
  title,
  index,
  children,
}: {
  testId: InventoryScreenTestId;
  title: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <Stack data-testid={testId} gap="100">
      <SectionLabel index={index}>{title}</SectionLabel>
      {children}
    </Stack>
  );
}

function CatalogSection() {
  const t = useTranslations("inventory");
  const query = useInventoryQuery();
  const install = useInstallSkillMutation();
  const rows = query.data?.catalog ?? [];
  const pendingId = install.isPending ? install.variables?.params.skillId : undefined;
  const failedId = install.isError ? install.variables?.params.skillId : undefined;

  const columns: DataTableColumn<InventoryCatalogEntry>[] = [
    { key: "name", label: t("columns.name"), width: "lg", render: (r) => r.name },
    { key: "desc", label: t("columns.description"), width: "flex", render: (r) => r.desc ?? "" },
    {
      key: "status",
      label: t("columns.status"),
      width: "md",
      render: (r) => <Tag tone={STATUS_TONE[r.status]}>{t(`status.${r.status}`)}</Tag>,
    },
    {
      key: "action",
      label: "",
      width: "xl",
      render: (r) => (
        <Stack data-testid={InventoryScreenTestId.CatalogRow} gap="50">
          {(r.status === "not-installed" || r.status === "outdated") && (
            <Button
              data-testid={InventoryScreenTestId.Install}
              disabled={pendingId === r.skillId}
              intent="secondary"
              onClick={() => install.mutate({ params: { skillId: r.skillId }, body: {} })}
              size="sm"
            >
              {r.status === "outdated" ? t("update") : t("install")}
            </Button>
          )}
          {r.status === "conflict" && (
            <Typography size="xs" type="note">
              {t("conflictHint")}
            </Typography>
          )}
          {failedId === r.skillId && (
            <Typography
              data-testid={InventoryScreenTestId.RowError}
              role="alert"
              size="xs"
              type="note"
            >
              {errorMessage(install.error)}
            </Typography>
          )}
        </Stack>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      empty={<span data-testid={InventoryScreenTestId.Empty}>{t("empty")}</span>}
      getRowKey={(r) => r.skillId}
      loading={query.isPending}
      rows={rows}
    />
  );
}

function McpSection() {
  const t = useTranslations("inventory");
  const rows = useInventoryQuery().data?.mcp ?? [];
  const columns: DataTableColumn<InventoryMcpServer>[] = [
    { key: "name", label: t("columns.name"), width: "lg", render: (r) => r.name },
    { key: "scope", label: t("columns.scope"), width: "sm", render: (r) => r.scope },
    { key: "transport", label: t("columns.transport"), width: "sm", render: (r) => r.transport },
    { key: "target", label: t("columns.target"), width: "flex", render: (r) => r.target ?? "" },
    { key: "plugin", label: t("columns.plugin"), width: "md", render: (r) => r.plugin ?? "" },
  ];
  return (
    <DataTable
      columns={columns}
      empty={<span data-testid={InventoryScreenTestId.Empty}>{t("empty")}</span>}
      getRowKey={(r) => `${r.scope}:${r.plugin ?? ""}:${r.name}`}
      rows={rows}
    />
  );
}

function SkillsSection() {
  const t = useTranslations("inventory");
  const rows = useInventoryQuery().data?.skills ?? [];
  const columns: DataTableColumn<InventorySkill>[] = [
    {
      key: "name",
      label: t("columns.name"),
      width: "lg",
      render: (r) => (
        <Stack align="center" direction="row" gap="75">
          <span>{r.name}</span>
          {r.zibbyManaged && <Tag tone="accent">ZIBBY</Tag>}
        </Stack>
      ),
    },
    {
      key: "desc",
      label: t("columns.description"),
      width: "flex",
      render: (r) => r.description ?? "",
    },
    {
      key: "source",
      label: t("columns.source"),
      width: "md",
      render: (r) =>
        r.source === "plugin" && r.plugin
          ? `${t("source.plugin")}: ${r.plugin}`
          : t(`source.${r.source}`),
    },
  ];
  return (
    <DataTable
      columns={columns}
      empty={<span data-testid={InventoryScreenTestId.Empty}>{t("empty")}</span>}
      getRowKey={(r) => `${r.source}:${r.plugin ?? ""}:${r.id}`}
      rows={rows}
    />
  );
}

function PluginsSection() {
  const t = useTranslations("inventory");
  const rows = useInventoryQuery().data?.plugins ?? [];
  const columns: DataTableColumn<InventoryPlugin>[] = [
    { key: "id", label: t("columns.name"), width: "lg", render: (r) => r.id },
    { key: "version", label: t("columns.version"), width: "sm", render: (r) => r.version ?? "" },
    {
      key: "enabled",
      label: t("columns.status"),
      width: "sm",
      render: (r) => (
        <Tag tone={r.enabled ? "ok" : "neutral"}>{r.enabled ? t("enabled") : t("disabled")}</Tag>
      ),
    },
    {
      key: "counts",
      label: t("columns.counts"),
      width: "md",
      render: (r) => t("counts", { skills: r.skillCount, mcp: r.mcpCount }),
    },
  ];
  return (
    <DataTable
      columns={columns}
      empty={<span data-testid={InventoryScreenTestId.Empty}>{t("empty")}</span>}
      getRowKey={(r) => r.id}
      rows={rows}
    />
  );
}

/** `/system/inventory` — what Claude Code has on this machine plus the ZIBBY skill catalog. */
export function InventoryScreen() {
  const t = useTranslations("inventory");
  const query = useInventoryQuery();

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Stack align="baseline" direction="row" gap="150" justify="between">
            <Typography type="title">{t("title")}</Typography>
            <Button
              data-testid={InventoryScreenTestId.Refresh}
              intent="secondary"
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {t("refresh")}
            </Button>
          </Stack>
          {query.isError ? (
            <QueryError onRetry={() => void query.refetch()} />
          ) : (
            <>
              <Section
                index={1}
                testId={InventoryScreenTestId.Catalog}
                title={t("sections.catalog")}
              >
                <CatalogSection />
              </Section>
              <Section index={2} testId={InventoryScreenTestId.Mcp} title={t("sections.mcp")}>
                <McpSection />
              </Section>
              <Section index={3} testId={InventoryScreenTestId.Skills} title={t("sections.skills")}>
                <SkillsSection />
              </Section>
              <Section
                index={4}
                testId={InventoryScreenTestId.Plugins}
                title={t("sections.plugins")}
              >
                <PluginsSection />
              </Section>
            </>
          )}
        </Stack>
      </PageContainer>
    </Container>
  );
}
