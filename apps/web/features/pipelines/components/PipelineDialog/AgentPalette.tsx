"use client";
import { useTranslations } from "next-intl";
import type { Agent } from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";
import {
  Button,
  Container,
  Icon,
  IconTile,
  Pressable,
  Stack,
  Typography,
} from "@zibby/design-system";

export interface AgentPaletteProps {
  agents: Agent[];
  /** Add the agent as a node (palette click — the keyboard/non-drag path). */
  onAdd: (agentId: string) => void;
  /**
   * Manual dismissal — the inline editor auto-closes the palette after an agent
   * is added, but the operator can also close it without adding one. Omitted in
   * the create-dialog split pane, where the palette is always visible.
   */
  onClose?: () => void;
  /** Accessible label for the close button (required when `onClose` is set). */
  closeLabel?: string;
}

/** Drag-data MIME the canvas reads on drop. */
export const AGENT_DND_TYPE = "text/agent";

const glyphOf = (a: Agent): IconName => (a.glyph as IconName | undefined) ?? "bot";

/**
 * Left rail listing every agent. Each row is draggable onto the canvas and also
 * click-to-add (a non-drag affordance kept for keyboard / a11y — full canvas
 * keyboard wiring is a known v1 limitation).
 */
export function AgentPalette({ agents, onAdd, onClose, closeLabel }: AgentPaletteProps) {
  const t = useTranslations("forms.pipeline");
  return (
    <Container
      height="100%"
      minHeight="0"
      overflowY="auto"
      padding={["100", "100", "150", "100"]}
      shrink={false}
      style={{
        borderRight: "1px solid var(--color-border)",
        background: "var(--color-background-deep)",
      }}
      width="232px"
    >
      <Stack align="start" direction="row" gap="50" justify="between">
        <Container padding={["50", "100", "100", "100"]}>
          <Typography mono uppercase size="2xs" tracking="widest" type="note" variant="tertiary">
            {t("paletteTitle")}
          </Typography>
          <Typography mono size="2xs" type="note" variant="tertiary">
            {agents.length === 0 ? t("noAgents") : t("paletteHint")}
          </Typography>
        </Container>
        {onClose && (
          <Button aria-label={closeLabel} icon="x" intent="ghost" onClick={onClose} size="sm" />
        )}
      </Stack>
      <Stack gap="25">
        {agents.map((a) => (
          <Pressable
            draggable
            aria-label={t("paletteAddAria", { agent: a.name ?? a.id })}
            data-testid={`palette-agent-${a.id}`}
            key={a.id}
            onClick={() => onAdd(a.id)}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData(AGENT_DND_TYPE, a.id);
            }}
          >
            <Container padding={["75", "100"]}>
              <Stack align="center" direction="row" gap="100">
                <IconTile glyph={glyphOf(a)} size="sm" />
                <Container grow minW0 textAlign="left">
                  <Typography mono truncate size="xs" type="note" weight="semibold">
                    {a.name ?? a.id}
                  </Typography>
                  {a.category && (
                    <Typography mono truncate size="2xs" type="note" variant="tertiary">
                      {a.category}
                    </Typography>
                  )}
                </Container>
                <Icon name="plus" size="xs" tone="faint" />
              </Stack>
            </Container>
          </Pressable>
        ))}
      </Stack>
    </Container>
  );
}
