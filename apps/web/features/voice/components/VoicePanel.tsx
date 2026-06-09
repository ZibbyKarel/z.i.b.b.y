import type { ReactNode } from "react";
import { Icon, type IconName, Stack, Typography } from "@zibby/design-system";

export interface VoicePanelProps {
  title: string;
  icon: IconName;
  children: ReactNode;
}

/**
 * An ambient frosted-glass corner card on the voice screen — a small labelled
 * surface (active agents, approvals, recent activity, quick actions) that floats
 * over the radial backdrop without competing with the orb.
 */
export function VoicePanel({ title, icon, children }: VoicePanelProps) {
  return (
    <div className="min-w-[192px] max-w-[228px] rounded border border-border-strong bg-surface-panel px-[13px] py-[11px] backdrop-blur-md">
      <Stack align="center" direction="row" gap="75">
        <Icon name={icon} size="xs" tone="faint" />
        <Typography mono uppercase size="2xs" tracking="widest" type="note" variant="tertiary">
          {title}
        </Typography>
      </Stack>
      <div className="mt-[9px]">{children}</div>
    </div>
  );
}
