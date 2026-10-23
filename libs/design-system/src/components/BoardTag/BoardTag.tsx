import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";

export enum BoardTagTestId {
  Root = "board-tag-root",
}

export interface BoardTagProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  /** `you` — ink-outlined "needs you" tag; `source` — hairline source chip. */
  variant: "you" | "source";
  children?: ReactNode;
  ref?: Ref<HTMLSpanElement>;
}

/** A caps tag: `YOU · 2H` (ink outline) or a source chip (`JIRA`, `GITHUB`). */
export function BoardTag({ variant, children, ref, ...props }: BoardTagProps) {
  return (
    <span
      className={cn(
        "inline-block flex-none rounded-sm border px-[5px] py-px font-sans text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap text-ink",
        variant === "you" ? "border-ink" : "border-line-2",
      )}
      data-testid={BoardTagTestId.Root}
      ref={ref}
      {...props}
    >
      {children}
    </span>
  );
}
