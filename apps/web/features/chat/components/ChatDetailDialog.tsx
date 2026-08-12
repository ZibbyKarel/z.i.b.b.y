"use client";

import type { Agent } from "@zibby/contracts";
import {
  Container,
  Dialog,
  EntityHero,
  type IconName,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { Pipeline } from "../../../domain";

/**
 * The entity the ⌘K quick-switcher picked, carried whole so the read-only detail
 * dialog can render it without a refetch (the palette already holds the record
 * from its own list query — the contract `Agent`, the dashboard-domain `Pipeline`).
 */
export type ChatDetailTarget =
  | { kind: "agent"; agent: Agent }
  | { kind: "pipeline"; pipeline: Pipeline };

export enum ChatDetailDialogTestId {
  Root = "chat-detail-dialog",
  Description = "chat-detail-description",
}

export interface ChatDetailDialogProps {
  /** The agent/pipeline picked in the palette — its detail is shown read-only. */
  detail: ChatDetailTarget;
  /** Close the dialog (Escape, backdrop, header ✕). */
  onClose: () => void;
}

/**
 * Read-only detail for a result picked in the chat ⌘K quick-switcher (Phase 58).
 *
 * ⌘K used to inject the picked agent/pipeline into the composer as an `@mention`
 * target — a job the `CommandLine`'s own inline `@`-search already owns (Phase
 * 45/51). ⌘K now instead OPENS the picked result's detail here: the shared DS
 * {@link EntityHero} profile band (avatar/glyph + name + description + meta),
 * exactly the identity surface every entity detail page leads with, wrapped in a
 * viewing {@link Dialog}. Viewing only — edits still live on the entity's own
 * `/agents/:id` · `/pipelines/:id` page.
 */
export function ChatDetailDialog({ detail, onClose }: ChatDetailDialogProps) {
  const t = useTranslations("chat.detail");

  const isAgent = detail.kind === "agent";
  const name = isAgent ? (detail.agent.name ?? detail.agent.id) : detail.pipeline.name;
  const desc = isAgent ? detail.agent.description : detail.pipeline.desc;
  const image = isAgent ? detail.agent.avatar : detail.pipeline.avatar;
  const glyph: IconName = isAgent
    ? ((detail.agent.glyph as IconName | undefined) ?? "bot")
    : "flow";

  const meta = isAgent ? (
    detail.agent.category ? (
      <Tag tone="accent">{detail.agent.category}</Tag>
    ) : undefined
  ) : (
    <Tag tone="accent">{t("phaseCount", { count: detail.pipeline.phases.length })}</Tag>
  );

  return (
    <Dialog
      open
      closeLabel={t("close")}
      description={isAgent ? t("kindAgent") : t("kindPipeline")}
      onClose={onClose}
      title={name}
      width="lg"
    >
      <Container data-testid={ChatDetailDialogTestId.Root}>
        <Stack gap="200">
          <EntityHero
            desc={desc}
            fit={isAgent ? "cover" : "contain"}
            glyph={glyph}
            height="sm"
            image={image}
            meta={meta}
            name={name}
          />
          {!desc && (
            <Typography
              data-testid={ChatDetailDialogTestId.Description}
              size="sm"
              type="note"
              variant="tertiary"
            >
              {t("noDescription")}
            </Typography>
          )}
        </Stack>
      </Container>
    </Dialog>
  );
}
