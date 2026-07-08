import { SUBSYSTEMS, type SubsystemId } from "@zibby/contracts";
import { Container, Stack, Typography } from "@zibby/design-system";

export enum PipelineOwnerChipTestId {
  Root = "pipeline-owner-chip",
  Dot = "pipeline-owner-chip-dot",
}

export interface PipelineOwnerChipProps {
  ownerSubsystem: SubsystemId;
}

/** Static id → {name, color} lookup — the registry (Phase 80) never changes at runtime. */
const SUBSYSTEM_BY_ID = new Map(SUBSYSTEMS.map((s) => [s.id, s] as const));

/**
 * Small owner indicator on a `/pipelines` index card (Phase 85 §3): the owning
 * subsystem's name behind a dot tinted with its own brand `color`. The DS
 * {@link Chip}/`StatusDot` tone palette has no per-instance color slot (same
 * limitation the drawer's hero band ran into — see `SubsystemDrawer`'s
 * `heroBandStyle` doc comment), so the dot is a plain DS `Container` circle
 * routed through its `style` passthrough rather than a new DS primitive for a
 * single-card affordance.
 */
export function PipelineOwnerChip({ ownerSubsystem }: PipelineOwnerChipProps) {
  const subsystem = SUBSYSTEM_BY_ID.get(ownerSubsystem);
  if (!subsystem) return null;
  return (
    <Stack
      inline
      align="center"
      data-testid={PipelineOwnerChipTestId.Root}
      direction="row"
      gap="50"
    >
      <Container
        data-testid={PipelineOwnerChipTestId.Dot}
        height="6px"
        shrink={false}
        style={{ borderRadius: "50%", background: subsystem.color }}
        width="6px"
      />
      <Typography mono size="2xs" type="note" variant="tertiary">
        {subsystem.name}
      </Typography>
    </Stack>
  );
}
