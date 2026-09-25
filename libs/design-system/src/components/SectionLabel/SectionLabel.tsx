import type { HTMLAttributes, ReactNode, Ref } from "react";
import { Row } from "../Stack/Stack";
import { Typography } from "../Typography/Typography";

export enum SectionLabelTestId {
  Root = "section-label-root",
  Index = "section-label-index",
  Text = "section-label-text",
  Action = "section-label-action",
}

export interface SectionLabelProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  /** Zero-padded ordinal rendered before the label — `index={3}` → `"03 — "`
   *  (DS.md §8's `"03 — ORG MAP"` section header). */
  index?: number;
  children: ReactNode;
  /** Right-aligned slot (a link, a count, a control). */
  action?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/** DS.md §8 section header — mono 11 / 0.14em / faint, optionally ordinal-prefixed,
 *  with an optional right-aligned action slot. The recurring page/panel eyebrow. */
export function SectionLabel({ index, children, action, ref, ...rest }: SectionLabelProps) {
  return (
    <Row data-testid={SectionLabelTestId.Root} gap="150" justify="between" ref={ref} {...rest}>
      <Typography data-testid={SectionLabelTestId.Text} type="label">
        {index !== undefined && (
          <span data-testid={SectionLabelTestId.Index}>{String(index).padStart(2, "0")} — </span>
        )}
        {children}
      </Typography>
      {action && <span data-testid={SectionLabelTestId.Action}>{action}</span>}
    </Row>
  );
}
