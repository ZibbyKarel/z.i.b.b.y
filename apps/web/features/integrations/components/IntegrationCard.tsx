import { cn, Button, Corners, Icon, Chip, StatusDot, type DotTone } from "@zibby/design-system";
import type { Integration, IntegrationStatus } from "../../../domain";

const statusMeta: Record<IntegrationStatus, { tone: DotTone; label: string }> = {
  connected:    { tone: "ok",    label: "připojeno" },
  disconnected: { tone: "faint", label: "odpojeno" },
  error:        { tone: "bad",   label: "chyba" },
};

const pillTone: Record<IntegrationStatus, "ok" | "neutral" | "bad"> = {
  connected:    "ok",
  disconnected: "neutral",
  error:        "bad",
};

export interface IntegrationCardProps {
  integration: Integration;
  onConfigure?: (integration: Integration) => void;
  onTest?: (integration: Integration) => void;
  className?: string;
}

export function IntegrationCard({ integration, onConfigure, onTest, className }: IntegrationCardProps) {
  const sm = statusMeta[integration.status];
  return (
    <div
      className={cn(
        "group relative rounded-sm border border-border bg-elevated p-3.5 transition-all hover:border-accent/35 hover:bg-raised",
        className,
      )}
    >
      <Corners inset="75" />
      <div className="flex items-start gap-3">
        <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-sm border border-accent/20 bg-accent-dim text-accent">
          <Icon name={integration.glyph} size="md" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-md font-semibold text-foreground">
            {integration.name}
          </div>
          <div className="mt-0.5 text-caption leading-snug text-foreground-dim">
            {integration.desc}
          </div>
        </div>
        <Chip tone={pillTone[integration.status]}>
          <StatusDot tone={sm.tone} size="75" />
          {sm.label}
        </Chip>
      </div>
      <div className="mt-3.5 flex items-center justify-between border-t border-border pt-3">
        <span className="max-w-[150px] truncate font-mono text-xs text-foreground-faint">
          {integration.file}
        </span>
        <div className="flex items-center gap-1.5">
          <Button intent="ghost" icon="link" size="sm" onClick={() => onTest?.(integration)}>
            Test
          </Button>
          <Button intent="ghost" icon="gear" size="sm" onClick={() => onConfigure?.(integration)}>
            Konfigurovat
          </Button>
        </div>
      </div>
    </div>
  );
}
