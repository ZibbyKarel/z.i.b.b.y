import type { ReactNode, Ref } from "react";
import { Container } from "../Container/Container";
import { SectionLabel } from "../SectionLabel/SectionLabel";
import { Stack } from "../Stack/Stack";
import { Typography } from "../Typography/Typography";

export enum RailTestId {
  Root = "rail-root",
  Header = "rail-header",
  Count = "rail-count",
  Body = "rail-body",
  Empty = "rail-empty",
}

export interface RailProps {
  /** Eyebrow title — defaults to DS.md §5's "Needs you" (`SectionLabel`
   *  already renders it mono-uppercase). */
  title?: string;
  /** Item count, shown as the section label's right-aligned action. */
  count?: number;
  /** Rendered instead of `children` when there is nothing to show — the DS
   *  App mock's "Nothing is waiting for you" placeholder line. */
  empty?: ReactNode;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/**
 * DS.md §5's left rail — the "NEEDS YOU" approvals list. `AppFrame` gives it
 * a fixed 280px column (and slides it in as a mobile drawer below 1024px);
 * `Rail` itself stays width-agnostic so it fits either context. Presentational
 * container only — `ApprovalCard` supplies the rows via `children`.
 */
export function Rail({ title = "Needs you", count, empty, children, ref }: RailProps) {
  const hasChildren = Boolean(children);
  return (
    <Stack
      as="aside"
      data-testid={RailTestId.Root}
      direction="col"
      ref={ref}
      style={{ height: "100%", minHeight: 0 }}
    >
      <Container
        data-testid={RailTestId.Header}
        padding={["250", "250", "150", "250"]}
      >
        <SectionLabel
          action={
            count !== undefined ? (
              <Typography data-testid={RailTestId.Count} type="labelSm" variant="tertiary">
                {count}
              </Typography>
            ) : undefined
          }
        >
          {title}
        </SectionLabel>
      </Container>

      <Container
        grow
        data-testid={RailTestId.Body}
        minHeight="0"
        overflow="auto"
        padding={["0", "150", "150", "150"]}
      >
        <Stack direction="col" gap="100">
          {hasChildren
            ? children
            : empty !== undefined && <div data-testid={RailTestId.Empty}>{empty}</div>}
        </Stack>
      </Container>
    </Stack>
  );
}
