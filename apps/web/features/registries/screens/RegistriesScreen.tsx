"use client";

import type { RegistryBindings } from "@zibby/contracts";
import { DEPARTMENTS, type DepartmentId } from "@zibby/contracts";
import {
  Button,
  Container,
  DataTable,
  type DataTableColumn,
  Stack,
  StatusDot,
  SubNav,
  Tag,
  Typography,
} from "@zibby/design-system";
import type { SubNavLinkComponent } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { QueryError } from "../../../components/LoadError/QueryError";
import { slug } from "../../../utils/slug";
import { AddCommandModal } from "../../commands/components/AddCommandModal/AddCommandModal";
import { useCreateCommandMutation } from "../../commands/mutations";
import { useCommandsQuery } from "../../commands/queries";
import { HookFormDialog } from "../../hooks/components/HookFormDialog";
import { useCreateHookMutation } from "../../hooks/mutations";
import { useHooksQuery } from "../../hooks/queries";
import {
  type McpServerCreateDraft,
  McpServerFormDialog,
} from "../../mcp/components/McpServerFormDialog";
import { useCreateMcpServerMutation, useSetMcpCredentialsMutation } from "../../mcp/mutations";
import { useMcpServersQuery } from "../../mcp/queries";
import { AddSkillModal } from "../../skills/components/AddSkillModal/AddSkillModal";
import { useCreateSkillMutation } from "../../skills/mutations";
import { useSkillCategoriesQuery, useSkillsQuery } from "../../skills/queries";
import { useRegistryBindingsQuery } from "../queries";

export const REGISTRY_KINDS = ["skills", "mcp", "hooks", "commands"] as const;
export type RegistryKindParam = (typeof REGISTRY_KINDS)[number];

export interface RegistriesScreenProps {
  kind: RegistryKindParam;
  /** `/system/registries/[kind]/new` — pre-opens the (unchanged) creation dialog;
   *  closing it without creating anything returns to the plain list route. */
  openCreateOnMount?: boolean;
}

/** The department tab a registry kind's "Bound in" tag links to (D-011/O-09) —
 *  `commands` has no dedicated department tab, so its tags render unlinked. */
const DEPARTMENT_TAB: Partial<Record<RegistryKindParam, string>> = {
  skills: "skills",
  mcp: "integrations",
  hooks: "hooks",
};

const DEPARTMENT_BY_ID = new Map(DEPARTMENTS.map((d) => [d.id, d] as const));

function BoundInCell({
  kind,
  departmentIds,
}: {
  kind: RegistryKindParam;
  departmentIds?: DepartmentId[];
}) {
  const ids = departmentIds ?? [];
  if (ids.length === 0) {
    return (
      <Typography mono size="xs" type="note" variant="tertiary">
        —
      </Typography>
    );
  }
  const tab = DEPARTMENT_TAB[kind];
  return (
    <Stack wrap direction="row" gap="50">
      {ids.map((id) => {
        const code = DEPARTMENT_BY_ID.get(id)?.code ?? id;
        const tag = <Tag key={id}>{code}</Tag>;
        return tab ? (
          <Link href={`/org/departments/${id}/${tab}`} key={id}>
            {tag}
          </Link>
        ) : (
          tag
        );
      })}
    </Stack>
  );
}

/**
 * `/system/registries/[kind]` (ZB-11, ROUTE-MAP §1/§3): a `DataTable` per global
 * library kind (skills, mcp, hooks, commands), horizontal `SubNav` to switch
 * kinds, and a "Bound in" column derived from `GET /api/registries/bindings`
 * (O-09 — read-only, no stored binding). Row click navigates to the unchanged
 * `/system/registries/<kind>/[id]` detail form; creation reuses each domain's
 * existing create-only dialog (N4d/N4e grammar) unchanged.
 */
export function RegistriesScreen({ kind, openCreateOnMount }: RegistriesScreenProps) {
  const t = useTranslations("registries");
  const router = useRouter();
  const [creating, setCreating] = useState(Boolean(openCreateOnMount));

  const closeCreate = () => {
    setCreating(false);
    if (openCreateOnMount) router.replace(`/system/registries/${kind}`);
  };

  const bindingsQuery = useRegistryBindingsQuery();
  const bindings: RegistryBindings | undefined = bindingsQuery.data;

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Stack align="baseline" direction="row" gap="150" justify="between">
            <Stack gap="50">
              <Typography mono size="sm" type="note" variant="tertiary">
                {t("eyebrow")}
              </Typography>
              <Typography type="title">{t("title")}</Typography>
              <Typography type="note" variant="secondary">
                {t("subtitle")}
              </Typography>
            </Stack>
            <Button icon="plus" intent="primary" onClick={() => setCreating(true)}>
              {t(`add.${kind}`)}
            </Button>
          </Stack>

          <SubNav
            items={REGISTRY_KINDS.map((k) => ({
              href: `/system/registries/${k}`,
              label: t(`kinds.${k}`),
              active: k === kind,
            }))}
            linkComponent={Link as SubNavLinkComponent}
          />

          {kind === "skills" && <SkillsTable bindings={bindings?.skills} />}
          {kind === "mcp" && <McpTable bindings={bindings?.mcp} />}
          {kind === "hooks" && <HooksTable bindings={bindings?.hooks} />}
          {kind === "commands" && <CommandsTable bindings={bindings?.commands} />}
        </Stack>
      </PageContainer>

      {creating && kind === "skills" && <CreateSkillDialog onClose={closeCreate} />}
      {creating && kind === "mcp" && <CreateMcpDialog onClose={closeCreate} />}
      {creating && kind === "hooks" && <CreateHookDialog onClose={closeCreate} />}
      {creating && kind === "commands" && <CreateCommandDialog onClose={closeCreate} />}
    </Container>
  );
}

// ---------------------------------------------------------------------------
// Per-kind tables
// ---------------------------------------------------------------------------

function SkillsTable({ bindings }: { bindings?: Record<string, DepartmentId[]> }) {
  const t = useTranslations("registries");
  const query = useSkillsQuery();
  const rows = query.data ?? [];
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: "name", label: t("columns.name"), width: "lg", render: (s) => s.name },
    { key: "desc", label: t("columns.description"), width: "flex", render: (s) => s.desc },
    {
      key: "meta",
      label: t("metaHeader.skills"),
      width: "sm",
      render: (s) => s.category ?? t("skillTypeFallback"),
    },
    {
      key: "boundIn",
      label: t("columns.boundIn"),
      width: "xl",
      render: (s) => <BoundInCell departmentIds={bindings?.[s.id]} kind="skills" />,
    },
  ];
  return (
    <DataTable
      columns={columns}
      empty={t("emptySkills")}
      getRowKey={(s) => s.id}
      loading={query.isPending}
      rowHref={(s) => `/system/registries/skills/${s.id}`}
      rows={rows}
    />
  );
}

function McpTable({ bindings }: { bindings?: Record<string, DepartmentId[]> }) {
  const t = useTranslations("registries");
  const query = useMcpServersQuery();
  const rows = query.data ?? [];
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: "name", label: t("columns.name"), width: "lg", render: (s) => s.name ?? s.id },
    {
      key: "desc",
      label: t("columns.description"),
      width: "flex",
      render: (s) => s.desc ?? (s.type === "stdio" ? s.command : s.url) ?? s.type,
    },
    {
      key: "meta",
      label: t("metaHeader.mcp"),
      width: "sm",
      render: (s) => (
        <Stack align="center" direction="row" gap="75">
          <StatusDot size="75" tone={s.enabled ? "ok" : "idle"} />
          <Typography mono size="xs" type="note">
            {s.enabled ? t("status.enabled") : t("status.disabled")}
          </Typography>
        </Stack>
      ),
    },
    {
      key: "boundIn",
      label: t("columns.boundIn"),
      width: "xl",
      render: (s) => <BoundInCell departmentIds={bindings?.[s.id]} kind="mcp" />,
    },
  ];
  return (
    <DataTable
      columns={columns}
      empty={t("emptyMcp")}
      getRowKey={(s) => s.id}
      loading={query.isPending}
      rowHref={(s) => `/system/registries/mcp/${s.id}`}
      rows={rows}
    />
  );
}

function HooksTable({ bindings }: { bindings?: Record<string, DepartmentId[]> }) {
  const t = useTranslations("registries");
  const query = useHooksQuery();
  const rows = query.data ?? [];
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: "name", label: t("columns.name"), width: "lg", render: (h) => h.name ?? h.id },
    {
      key: "desc",
      label: t("columns.description"),
      width: "flex",
      render: (h) => h.desc ?? h.command,
    },
    { key: "meta", label: t("metaHeader.hooks"), width: "sm", render: (h) => h.event },
    {
      key: "boundIn",
      label: t("columns.boundIn"),
      width: "xl",
      render: (h) => <BoundInCell departmentIds={bindings?.[h.id]} kind="hooks" />,
    },
  ];
  return (
    <DataTable
      columns={columns}
      empty={t("emptyHooks")}
      getRowKey={(h) => h.id}
      loading={query.isPending}
      rowHref={(h) => `/system/registries/hooks/${h.id}`}
      rows={rows}
    />
  );
}

function CommandsTable({ bindings }: { bindings?: Record<string, DepartmentId[]> }) {
  const t = useTranslations("registries");
  const query = useCommandsQuery();
  const rows = query.data ?? [];
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: "name", label: t("columns.name"), width: "lg", render: (c) => `/${c.id}` },
    {
      key: "desc",
      label: t("columns.description"),
      width: "flex",
      render: (c) => c.description ?? c["argument-hint"] ?? "",
    },
    {
      key: "meta",
      label: t("metaHeader.commands"),
      width: "sm",
      render: (c) =>
        c["disable-model-invocation"] ? t("commandScope.manual") : t("commandScope.auto"),
    },
    {
      key: "boundIn",
      label: t("columns.boundIn"),
      width: "xl",
      render: (c) => <BoundInCell departmentIds={bindings?.[c.id]} kind="commands" />,
    },
  ];
  return (
    <DataTable
      columns={columns}
      empty={t("emptyCommands")}
      getRowKey={(c) => c.id}
      loading={query.isPending}
      rowHref={(c) => `/system/registries/commands/${c.id}`}
      rows={rows}
    />
  );
}

// ---------------------------------------------------------------------------
// Creation dialogs — unchanged forms, reused verbatim from each domain
// ---------------------------------------------------------------------------

function CreateSkillDialog({ onClose }: { onClose: () => void }) {
  const tk = useTranslations();
  const router = useRouter();
  const { data: categories = [] } = useSkillCategoriesQuery();
  const createSkill = useCreateSkillMutation();

  return (
    <AddSkillModal
      categories={categories.map((c) => c.name)}
      onClose={onClose}
      onSubmit={({ name, desc, category, glyph, instructions }) => {
        const id = slug(name, "novy");
        const safeDesc = desc || tk("defaults.skill");
        createSkill.mutate(
          {
            body: {
              id,
              name: name || id,
              glyph,
              desc: safeDesc,
              category,
              instructions: instructions || safeDesc,
            },
          },
          {
            onSuccess: () => {
              onClose();
              router.push(`/system/registries/skills/${id}`);
            },
          },
        );
      }}
      pending={createSkill.isPending}
    />
  );
}

function CreateMcpDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const create = useCreateMcpServerMutation();
  const setCredentials = useSetMcpCredentialsMutation();

  const onCreate = ({ create: body, authToken }: McpServerCreateDraft) => {
    create.mutate(
      { body },
      {
        onSuccess: () => {
          if (authToken) {
            setCredentials.mutate({ params: { id: body.id }, body: { authToken } });
          }
          onClose();
          router.push(`/system/registries/mcp/${body.id}`);
        },
      },
    );
  };

  return <McpServerFormDialog onClose={onClose} onCreate={onCreate} />;
}

function CreateHookDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const create = useCreateHookMutation();

  return (
    <HookFormDialog
      onClose={onClose}
      onCreate={(body) =>
        create.mutate(
          { body },
          {
            onSuccess: () => {
              onClose();
              router.push(`/system/registries/hooks/${body.id}`);
            },
          },
        )
      }
    />
  );
}

function CreateCommandDialog({ onClose }: { onClose: () => void }) {
  const tk = useTranslations();
  const router = useRouter();
  const createCommand = useCreateCommandMutation();

  return (
    <AddCommandModal
      onClose={onClose}
      onSubmit={({
        id,
        description,
        argumentHint,
        allowedTools,
        model,
        disableModelInvocation,
        enabled,
        instructions,
      }) =>
        createCommand.mutate(
          {
            body: {
              id,
              description,
              "argument-hint": argumentHint,
              "allowed-tools": allowedTools,
              model,
              "disable-model-invocation": disableModelInvocation,
              enabled,
              instructions: instructions || tk("defaults.command"),
            },
          },
          {
            onSuccess: () => {
              onClose();
              router.push(`/system/registries/commands/${id}`);
            },
          },
        )
      }
      pending={createCommand.isPending}
    />
  );
}
