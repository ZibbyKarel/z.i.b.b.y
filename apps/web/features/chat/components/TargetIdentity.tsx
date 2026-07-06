import { Icon, IconTile, Stack, Typography } from "@zibby/design-system";
import type { IconName } from "@zibby/design-system";
import type { TaskTarget } from "@zibby/contracts";

export enum TargetIdentityTestId {
  Root = "chat-message-tool-event-target",
}

/** The orchestrator has no `glyph` in its display shape today — fall back to its
 * compass; a stored agent/pipeline/goal/chain target falls back to a generic bot. */
export function targetGlyph(target: TaskTarget): IconName {
  if (target.kind === "orchestrator") return "compass";
  return (target.glyph as IconName | undefined) ?? "bot";
}

/**
 * The dispatch identity for a tool event — a small `IconTile` chip naming the
 * routing target (Fáze 14.2, Rozhodnutí 4). Accepts an array so a future
 * `orchestrátor → sub-agent` chain (once a run's sub-agent is known) is just
 * another entry — today every event carries at most one target. Lives in its own
 * module because both `ChatMessage` and `ChatRunCard` render it (Fáze 14.3) —
 * either importing it from the other would be a module cycle.
 */
export function TargetIdentity({ targets }: { targets: TaskTarget[] }) {
  if (targets.length === 0) return null;
  return (
    <Stack wrap align="center" data-testid={TargetIdentityTestId.Root} direction="row" gap="50">
      {targets.map((target, i) => (
        <Stack align="center" direction="row" gap="50" key={`${target.kind}-${i}`}>
          {i > 0 && <Icon name="chevron" size="xs" tone="faint" />}
          <IconTile glyph={targetGlyph(target)} size="sm" tone="accent" />
          <Typography mono size="xs" tone="accent" type="note">
            {target.name}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}
