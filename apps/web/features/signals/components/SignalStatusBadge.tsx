import type { HandoffSignalKindStatus } from "@zibby/contracts";
import { type IconName, Tag, type TagTone } from "@zibby/design-system";
import { useTranslations } from "next-intl";

export enum SignalStatusBadgeTestId {
  Root = "signal-status-badge",
}

export interface SignalStatusBadgeProps {
  status: HandoffSignalKindStatus;
}

/** Tone + glyph per registry status — distinct colors so builtin/pending/active
 * read apart at a glance in the `/signals` list and detail (B3a design doc). */
const STATUS_META: Record<HandoffSignalKindStatus, { tone: TagTone; icon: IconName }> = {
  builtin: { tone: "neutral", icon: "shield" },
  pending: { tone: "warn", icon: "wait" },
  active: { tone: "ok", icon: "ok" },
};

/**
 * A signal kind's registry status as a colored {@link Tag} — mirrors
 * `RunStateBadge`'s shape (tone + glyph keyed off a small status union).
 */
export function SignalStatusBadge({ status }: SignalStatusBadgeProps) {
  const t = useTranslations("signals");
  const meta = STATUS_META[status];
  return (
    <Tag uppercase data-testid={SignalStatusBadgeTestId.Root} icon={meta.icon} tone={meta.tone}>
      {t(`status.${status}`)}
    </Tag>
  );
}
