import type { ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { Container } from "../Container/Container";
import { Icon } from "../Icon/Icon";
import { SectionLabel } from "../SectionLabel/SectionLabel";
import { Stack } from "../Stack/Stack";
import { Typography } from "../Typography/Typography";

export enum RailTestId {
  Root = "rail-root",
  Header = "rail-header",
  ToggleButton = "rail-toggle-button",
  Chevron = "rail-chevron",
  Count = "rail-count",
  Body = "rail-body",
  Empty = "rail-empty",
}

export interface RailProps {
  /** Eyebrow title — defaults to DS.md §5's "Needs you" (`SectionLabel`
   *  already renders it mono-uppercase). In `collapsible` mode this is the
   *  whole header text (e.g. the caller formats `"PINNED · 04"` itself) —
   *  the header has no separate count slot there. */
  title?: string;
  /** Item count, shown as the section label's right-aligned action.
   *  Ignored in `collapsible` mode (fold the count into `title` instead). */
  count?: number;
  /** Rendered instead of `children` when there is nothing to show — the DS
   *  App mock's "Nothing is waiting for you" placeholder line. */
  empty?: ReactNode;
  children?: ReactNode;
  /** Makes the header a toggle button that shows/hides the body — the
   *  ZibbyCorp "PINNED" rail section. Omitted (default `false`), `Rail`
   *  behaves exactly as before: a static header, body always rendered,
   *  filling the available height. */
  collapsible?: boolean;
  /** Whether the body is shown — only read when `collapsible`. Default `true`. */
  open?: boolean;
  /** Fires when the header button is activated — only read when `collapsible`. */
  onToggle?: () => void;
  /** Caps the body's height (e.g. `"260px"`) so a long list scrolls in place
   *  instead of pushing sibling rail sections off-screen — only meaningful
   *  when `collapsible` (a non-collapsible `Rail` keeps growing to fill its
   *  flex parent, as before). */
  maxHeight?: string;
  ref?: Ref<HTMLElement>;
}

/**
 * DS.md §5's left rail — the "NEEDS YOU" approvals list. `AppFrame` gives it
 * a fixed 280px column (and slides it in as a mobile drawer below 1024px);
 * `Rail` itself stays width-agnostic so it fits either context. Presentational
 * container only — `ApprovalCard` supplies the rows via `children`.
 *
 * `collapsible` (ZibbyCorp "PINNED" section, stacked above this same rail's
 * NEEDS YOU/RUNNING) swaps the static `SectionLabel` header for a toggle
 * button with a rotating chevron, and bounds the body with `maxHeight`
 * instead of letting it grow — the caller (e.g. `PinnedRail`) owns the
 * open/closed state (and persists it) since that's a per-viewer convenience,
 * not something this presentational component should remember.
 */
export function Rail({
  title = "Needs you",
  count,
  empty,
  children,
  collapsible = false,
  open = true,
  onToggle,
  maxHeight,
  ref,
}: RailProps) {
  const hasChildren = Boolean(children);
  const showBody = !collapsible || open;
  return (
    <Stack
      as="aside"
      data-testid={RailTestId.Root}
      direction="col"
      ref={ref}
      style={{ height: "100%", minHeight: 0 }}
    >
      <Container data-testid={RailTestId.Header} padding={["250", "250", "150", "250"]}>
        {collapsible ? (
          <button
            aria-expanded={open}
            className={cn(
              "flex w-full items-center justify-between gap-2 border-none bg-transparent p-0 text-left",
              "cursor-pointer text-foreground-faint transition-colors hover:text-foreground",
              focusRingInset,
            )}
            data-testid={RailTestId.ToggleButton}
            onClick={onToggle}
            type="button"
          >
            <Typography type="label">{title}</Typography>
            <Icon
              data-testid={RailTestId.Chevron}
              name="chevron"
              size="sm"
              stroke="medium"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
            />
          </button>
        ) : (
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
        )}
      </Container>

      {showBody && (
        <Container
          data-testid={RailTestId.Body}
          grow={!collapsible}
          maxHeight={maxHeight}
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
      )}
    </Stack>
  );
}
