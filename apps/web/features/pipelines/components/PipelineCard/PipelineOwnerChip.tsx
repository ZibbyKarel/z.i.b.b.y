import { DEPARTMENTS, type DepartmentId } from "@zibby/contracts";
import { Container, Stack, Typography } from "@zibby/design-system";

export enum PipelineOwnerChipTestId {
  Root = "pipeline-owner-chip",
  Dot = "pipeline-owner-chip-dot",
}

export interface PipelineOwnerChipProps {
  department: DepartmentId;
}

/** Static id → {name, color} lookup — the registry (Phase 80) never changes at runtime. */
const DEPARTMENT_BY_ID = new Map(DEPARTMENTS.map((s) => [s.id, s] as const));

/**
 * Small owner indicator on a `/pipelines` index card (Phase 85 §3): the owning
 * department's name behind a dot tinted with its own brand `color`. The DS
 * {@link Chip}/`StatusDot` tone palette has no per-instance color slot (same
 * limitation the drawer's hero band ran into — see `DepartmentDrawer`'s
 * `heroBandStyle` doc comment), so the dot is a plain DS `Container` circle
 * routed through its `style` passthrough rather than a new DS primitive for a
 * single-card affordance.
 */
export function PipelineOwnerChip({ department }: PipelineOwnerChipProps) {
  const dept = DEPARTMENT_BY_ID.get(department);
  if (!dept) return null;
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
        style={{ borderRadius: "50%", background: dept.color }}
        width="6px"
      />
      <Typography mono size="2xs" type="note" variant="tertiary">
        {dept.name}
      </Typography>
    </Stack>
  );
}
