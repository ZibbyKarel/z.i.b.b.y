import { Button } from "@zibby/design-system";
import { SectionLabel } from "../SectionLabel/SectionLabel";

export interface SectionToolbarProps {
  /** The section caption (uppercase mono label). */
  label: string;
  /** Primary "add" button text; omit to render the label without an action. */
  addLabel?: string;
  onAdd?: () => void;
}

/**
 * A SectionLabel paired with the conventional primary "+ add" button. Collapses
 * the repeated `<SectionLabel action={<Button icon="plus" intent="run" …>}>`
 * pattern shared by the skills, integrations and pipelines screens.
 */
export function SectionToolbar({ label, addLabel, onAdd }: SectionToolbarProps) {
  return (
    <SectionLabel
      action={
        addLabel ? (
          <Button icon="plus" intent="run" onClick={onAdd} size="sm">
            {addLabel}
          </Button>
        ) : undefined
      }
    >
      {label}
    </SectionLabel>
  );
}
