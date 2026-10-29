"use client";

import type { RegistryBindings } from "@zibby/contracts";
import { type DepartmentId } from "@zibby/contracts";
import {
  Button,
  Container,
  EmptyState,
  EntityCard,
  Grid,
  type IconName,
  Stack,
  StatusDot,
  Tag,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { slug } from "../../../utils/slug";
import { AgentsByDepartment } from "../../agents/components/AgentsByDepartment";
import { NewAgentDialog } from "../../agents/components/NewAgentDialog";
import { useCreateAgentMutation } from "../../agents/mutations";
import { useCategoriesQuery } from "../../agents/queries";
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
import { toastBus } from "../../../components/Toaster/toastBus";
import { AddSkillModal } from "../../skills/components/AddSkillModal/AddSkillModal";
import { ExternalSkillSource } from "../../skills/components/ExternalSkillSource";
import { InstallExternalSkillDialog } from "../../skills/components/InstallExternalSkillDialog";
import { useCreateSkillMutation, useSyncAllExternalSkillsMutation } from "../../skills/mutations";
import { useSkillCategoriesQuery, useSkillsQuery } from "../../skills/queries";
import { useRegistryBindingsQuery } from "../queries";
import { type RegistryKindParam, registryHref } from "../registryKinds";

export enum RegistriesScreenTestId {
  SyncAllSkills = "registries-sync-all-skills",
  InstallSkills = "registries-install-skills",
  Empty = "registries-empty",
  BoundIn = "registries-bound-in",
}

export interface RegistriesScreenProps {
  kind: RegistryKindParam;
  /** `/system/registries/[kind]/new` — pre-opens the (unchanged) creation dialog;
   *  closing it without creating anything returns to the plain list route. */
  openCreateOnMount?: boolean;
}

/** The department tab a registry kind's "Bound in" tag links to (D-011/O-09) —
 *  `commands` has no dedicated department tab, so its tags render unlinked. */
const DEPARTMENT_TAB: Partial<Record<RegistryKindParam, string>> = {
  agents: "team",
  skills: "skills",
  mcp: "integrations",
  hooks: "hooks",
};

/** The card footer for an item bound in departments, or none — an empty footer would still draw its divider. */
function boundIn(kind: RegistryKindParam, departmentIds?: DepartmentId[]) {
  return departmentIds && departmentIds.length > 0 ? (
    <BoundIn departmentIds={departmentIds} kind={kind} />
  ) : undefined;
}

/**
 * The "Bound in" card footer: department codes linking to the department tab that
 * binds the item. Lives in the card's `actions` slot, outside its open target, so
 * the links never nest inside the card's button.
 */
function BoundIn({
  kind,
  departmentIds: ids,
}: {
  kind: RegistryKindParam;
  departmentIds: DepartmentId[];
}) {
  const t = useTranslations("registries");
  const departments = useDepartmentLookup();
  const tab = DEPARTMENT_TAB[kind];
  return (
    <Stack
      wrap
      align="center"
      data-testid={RegistriesScreenTestId.BoundIn}
      direction="row"
      gap="50"
    >
      <Typography mono size="xs" type="note" variant="tertiary">
        {t("columns.boundIn")}
      </Typography>
      {ids.map((id) => {
        const code = departments.get(id)?.code ?? id;
        const tag = <Tag key={id}>{code}</Tag>;
        return tab ? (
          <Link href={`/workforce/departments/${id}/${tab}`} key={id}>
            {tag}
          </Link>
        ) : (
          tag
        );
      })}
    </Stack>
  );
}

interface RegistryCardsQuery<T> {
  data?: T[];
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
}

/** Loading / error / empty states around a card grid laid out like the Agents and Marketplace pages. */
function RegistryCards<T>({
  query,
  empty,
  renderCard,
}: {
  query: RegistryCardsQuery<T>;
  empty: string;
  renderCard: (row: T) => ReactNode;
}) {
  if (query.isPending) return <QueryLoading />;
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;
  const rows = query.data ?? [];
  if (rows.length === 0)
    return <EmptyState data-testid={RegistriesScreenTestId.Empty} title={empty} />;
  return (
    <Grid cols={1} gap="150" lg={3} md={2}>
      {rows.map(renderCard)}
    </Grid>
  );
}

/**
 * `/system/registries/[kind]` (ZB-11, ROUTE-MAP §1/§3): a card grid per global
 * library kind (skills, mcp, hooks, commands), the same `EntityCard` layout as the
 * Agents and Marketplace pages; kind switching lives in the shell's sub-nav row
 * (`AppShell`). Each card footer shows "Bound in" derived from
 * `GET /api/registries/bindings` (O-09 — read-only, no stored binding); agents show
 * their department. A card click navigates to the unchanged
 * `/system/registries/<kind>/[id]` detail form; creation reuses each domain's
 * existing create-only dialog (N4d/N4e grammar) unchanged.
 */
export function RegistriesScreen({ kind, openCreateOnMount }: RegistriesScreenProps) {
  const t = useTranslations("registries");
  const router = useRouter();
  const [creating, setCreating] = useState(Boolean(openCreateOnMount));

  const closeCreate = () => {
    setCreating(false);
    if (openCreateOnMount) router.replace(registryHref(kind) as Route);
  };

  const bindingsQuery = useRegistryBindingsQuery();
  const bindings: RegistryBindings | undefined = bindingsQuery.data;

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Stack align="baseline" direction="row" gap="150" justify="between">
            <Typography type="title">{t("title")}</Typography>
            <Stack align="center" direction="row" gap="100">
              {kind === "skills" && <ExternalSkillActions />}
              <Button icon="plus" intent="primary" onClick={() => setCreating(true)}>
                {t(`add.${kind}`)}
              </Button>
            </Stack>
          </Stack>

          {kind === "agents" && <AgentsByDepartment />}
          {kind === "skills" && <SkillsCards bindings={bindings?.skills} />}
          {kind === "mcp" && <McpCards bindings={bindings?.mcp} />}
          {kind === "hooks" && <HooksCards bindings={bindings?.hooks} />}
          {kind === "commands" && <CommandsCards bindings={bindings?.commands} />}
        </Stack>
      </PageContainer>

      {creating && kind === "agents" && <CreateAgentDialog onClose={closeCreate} />}
      {creating && kind === "skills" && <CreateSkillDialog onClose={closeCreate} />}
      {creating && kind === "mcp" && <CreateMcpDialog onClose={closeCreate} />}
      {creating && kind === "hooks" && <CreateHookDialog onClose={closeCreate} />}
      {creating && kind === "commands" && <CreateCommandDialog onClose={closeCreate} />}
    </Container>
  );
}

/** Skills-only header actions: install from a GitHub repo, and sync every external skill. */
function ExternalSkillActions() {
  const t = useTranslations("skills.external");
  const syncAll = useSyncAllExternalSkillsMutation();
  const [installing, setInstalling] = useState(false);

  const sync = () =>
    syncAll.mutate(
      { body: {} },
      {
        onSuccess: ({ body }) =>
          toastBus.emit({
            severity: body.failed.length > 0 ? "error" : "ok",
            message: t("syncAllDone", {
              checked: body.checked,
              updated: body.updated.length,
              failed: body.failed.length,
            }),
          }),
      },
    );

  return (
    <>
      <Button
        data-testid={RegistriesScreenTestId.SyncAllSkills}
        icon="retry"
        loading={syncAll.isPending}
        onClick={sync}
      >
        {t("syncAllAction")}
      </Button>
      <Button
        data-testid={RegistriesScreenTestId.InstallSkills}
        icon="branch"
        onClick={() => setInstalling(true)}
      >
        {t("installAction")}
      </Button>
      {installing && <InstallExternalSkillDialog onClose={() => setInstalling(false)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Per-kind card grids
// ---------------------------------------------------------------------------

type Bindings = Record<string, DepartmentId[]>;

function SkillsCards({ bindings }: { bindings?: Bindings }) {
  const t = useTranslations("registries");
  const router = useRouter();
  return (
    <RegistryCards
      empty={t("emptySkills")}
      query={useSkillsQuery()}
      renderCard={(s) => (
        <EntityCard
          actions={boundIn("skills", bindings?.[s.id])}
          badges={[
            [
              s.source ? (
                <ExternalSkillSource key="source" source={s.source} />
              ) : (
                <Tag key="category">{s.category ?? t("skillTypeFallback")}</Tag>
              ),
            ],
          ]}
          description={s.desc}
          glyph={(s.glyph as IconName | undefined) ?? "brain"}
          key={s.id}
          onClick={() => router.push(registryHref("skills", s.id) as Route)}
          openLabel={t("openAria", { name: s.name })}
          subtitle={s.id !== s.name ? s.id : undefined}
          title={s.name}
        />
      )}
    />
  );
}

function McpCards({ bindings }: { bindings?: Bindings }) {
  const t = useTranslations("registries");
  const router = useRouter();
  return (
    <RegistryCards
      empty={t("emptyMcp")}
      query={useMcpServersQuery()}
      renderCard={(s) => (
        <EntityCard
          actions={boundIn("mcp", bindings?.[s.id])}
          aside={
            <Stack align="center" direction="row" gap="75">
              <StatusDot size="75" tone={s.enabled ? "ok" : "idle"} />
              <Typography mono size="xs" type="note">
                {s.enabled ? t("status.enabled") : t("status.disabled")}
              </Typography>
            </Stack>
          }
          badges={[[<Tag key="type">{s.type}</Tag>]]}
          description={s.desc}
          glyph="server"
          key={s.id}
          onClick={() => router.push(registryHref("mcp", s.id) as Route)}
          openLabel={t("openAria", { name: s.name ?? s.id })}
          subtitle={(s.type === "stdio" ? s.command : s.url) ?? s.id}
          title={s.name ?? s.id}
        />
      )}
    />
  );
}

function HooksCards({ bindings }: { bindings?: Bindings }) {
  const t = useTranslations("registries");
  const router = useRouter();
  return (
    <RegistryCards
      empty={t("emptyHooks")}
      query={useHooksQuery()}
      renderCard={(h) => (
        <EntityCard
          actions={boundIn("hooks", bindings?.[h.id])}
          badges={[[<Tag key="event">{h.event}</Tag>]]}
          description={h.desc}
          glyph="bolt"
          key={h.id}
          onClick={() => router.push(registryHref("hooks", h.id) as Route)}
          openLabel={t("openAria", { name: h.name ?? h.id })}
          subtitle={h.command}
          title={h.name ?? h.id}
        />
      )}
    />
  );
}

function CommandsCards({ bindings }: { bindings?: Bindings }) {
  const t = useTranslations("registries");
  const router = useRouter();
  return (
    <RegistryCards
      empty={t("emptyCommands")}
      query={useCommandsQuery()}
      renderCard={(c) => (
        <EntityCard
          actions={boundIn("commands", bindings?.[c.id])}
          badges={[
            [
              <Tag key="scope">
                {c["disable-model-invocation"] ? t("commandScope.manual") : t("commandScope.auto")}
              </Tag>,
            ],
          ]}
          description={c.description}
          glyph="code"
          key={c.id}
          onClick={() => router.push(registryHref("commands", c.id) as Route)}
          openLabel={t("openAria", { name: `/${c.id}` })}
          subtitle={c["argument-hint"]}
          title={`/${c.id}`}
        />
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Creation dialogs — unchanged forms, reused verbatim from each domain
// ---------------------------------------------------------------------------

function CreateAgentDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data: categories = [] } = useCategoriesQuery();
  const createAgent = useCreateAgentMutation();

  return (
    <NewAgentDialog
      categories={categories}
      onClose={onClose}
      onCreate={(d) => {
        const id = slug(d.name ?? "") || `agent-${Date.now()}`;
        createAgent.mutate(
          { body: { ...d, id } },
          {
            onSuccess: () => {
              onClose();
              router.push(registryHref("agents", id) as Route);
            },
          },
        );
      }}
      pending={createAgent.isPending}
    />
  );
}

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
