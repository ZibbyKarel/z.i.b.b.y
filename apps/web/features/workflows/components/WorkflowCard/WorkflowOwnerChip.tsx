import { type DepartmentId } from "@zibby/contracts";
import { Container, Stack, Typography } from "@zibby/design-system";
import { useDepartmentLookup } from "../../../departments/useDepartmentLookup";

export enum WorkflowOwnerChipTestId {
  Root = "workflow-owner-chip",
  Dot = "workflow-owner-chip-dot",
}

export interface WorkflowOwnerChipProps {
  department: DepartmentId;
}

/**
 * Small owner indicator on a `/workflows` index card (Phase 85 §3): the owning
 * department's name behind a dot tinted with its own brand `color`. The DS
 * {@link Chip}/`StatusDot` tone palette has no per-instance color slot (same
 * limitation the drawer's hero band ran into — see `DepartmentDrawer`'s
 * `heroBandStyle` doc comment), so the dot is a plain DS `Container` circle
 * routed through its `style` passthrough rather than a new DS primitive for a
 * single-card affordance.
 */
export function WorkflowOwnerChip({ department }: WorkflowOwnerChipProps) {
  const dept = useDepartmentLookup().get(department);
  if (!dept) return null;
  return (
    <Stack
      inline
      align="center"
      data-testid={WorkflowOwnerChipTestId.Root}
      direction="row"
      gap="50"
    >
      <Container
        data-testid={WorkflowOwnerChipTestId.Dot}
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
