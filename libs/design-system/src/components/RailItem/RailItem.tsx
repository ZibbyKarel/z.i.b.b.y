import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";

export enum RailItemTestId {
  Root = "rail-item-root",
  Leading = "rail-item-leading",
  Title = "rail-item-title",
  Meta = "rail-item-meta",
}

export interface RailItemProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "title"
> {
  /** 30px centred leading column (e.g. an AgentBadge). */
  leading?: ReactNode;
  title: ReactNode;
  /** Small mono caption under the title (e.g. a StateDot + text). */
  meta?: ReactNode;
  selected?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** A selectable row of a vertical rail (Run Detail stage list). The selected
 * row gets a 2px ink bar on the left and a raised background. */
export function RailItem({ leading, title, meta, selected, ref, ...rest }: RailItemProps) {
  return (
    <button
      aria-current={selected || undefined}
      className={cn(
        "grid w-full cursor-pointer grid-cols-[30px_minmax(0,1fr)] items-center gap-[10px] border-l-2 py-[9px] pr-4 pl-[14px] text-left hover:bg-elevated",
        selected ? "border-foreground bg-elevated" : "border-transparent",
        focusRingInset,
      )}
      data-testid={RailItemTestId.Root}
      ref={ref}
      type="button"
      {...rest}
    >
      <span className="flex justify-center" data-testid={RailItemTestId.Leading}>
        {leading}
      </span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span
          className="text-[13px] font-medium text-foreground"
          data-testid={RailItemTestId.Title}
        >
          {title}
        </span>
        {meta && (
          <span
            className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-foreground-faint"
            data-testid={RailItemTestId.Meta}
          >
            {meta}
          </span>
        )}
      </span>
    </button>
  );
}
