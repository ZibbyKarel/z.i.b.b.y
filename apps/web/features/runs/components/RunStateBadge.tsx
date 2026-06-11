import { Icon, Stack, Tag } from "@zibby/design-system";
import { type FeedStatus, RUN_STATE } from "../run";

export interface RunStateBadgeProps {
  status: FeedStatus;
  /** Canonical contract name, surfaced as a tooltip (design keeps it behind the Czech label). */
  canonTitle?: string;
  label: string;
  size?: "sm" | "md";
}

/** Run-state badge — Czech label up front, canonical contract name in the tooltip. */
export function RunStateBadge({
  status,
  canonTitle,
  label,
  size = "sm",
}: RunStateBadgeProps) {
  const meta = RUN_STATE[status];
  return (
    <span title={canonTitle ?? status}>
      <Tag size={size} tone={meta.badge}>
        <Stack inline align="center" direction="row" gap="50">
          <Icon name={meta.glyph} size="xs" />
          {label}
        </Stack>
      </Tag>
    </span>
  );
}
