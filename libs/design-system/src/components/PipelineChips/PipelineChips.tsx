import type { Ref } from "react";
import type { StateTone } from "../../stateTone";
import { cn } from "../../utils/cn";

export enum PipelineChipsTestId {
  Root = "pipeline-chips-root",
  /** Suffixed with the chip index: `pipeline-chips-chip-0`. */
  Chip = "pipeline-chips-chip",
}

export interface PipelineChip {
  code: string;
  state: StateTone;
  /** Tooltip. */
  title?: string;
}

const UNDERLINE: Record<StateTone, string> = {
  working: "border-b-[color:var(--color-state-work)]",
  thinking: "border-b-[color:var(--color-state-think)]",
  blocked: "border-b-[color:var(--color-state-block)]",
  error: "border-b-[color:var(--color-state-err)]",
  done: "border-b-[color:var(--color-state-done)]",
  idle: "border-b-[color:var(--color-state-idle)]",
};

export interface PipelineChipsProps {
  chips: readonly PipelineChip[];
  ref?: Ref<HTMLSpanElement>;
}

/** Department pipeline chips: mono 9 code over a 2px bottom rule in the stage's state colour. */
export function PipelineChips({ chips, ref }: PipelineChipsProps) {
  return (
    <span className="flex gap-[2px]" data-testid={PipelineChipsTestId.Root} ref={ref}>
      {chips.map((c, i) => (
        <span
          className={cn(
            "border-b-2 bg-bg px-[4px] pb-px pt-[2px] font-sans font-semibold uppercase tracking-wider text-[9px]",
            c.state === "idle" ? "text-ink-3" : "text-ink",
            UNDERLINE[c.state],
          )}
          data-testid={`${PipelineChipsTestId.Chip}-${i}`}
          key={`${c.code}-${i}`}
          title={c.title}
        >
          {c.code}
        </span>
      ))}
    </span>
  );
}
