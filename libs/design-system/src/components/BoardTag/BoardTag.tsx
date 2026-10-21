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

/** A square mono tag: `YOU · 2H` (ink outline) or a source chip (`JIRA`, `GITHUB`). */
export function BoardTag({ variant, children, ref, ...props }: BoardTagProps) {
  return (
    <span
      className={cn(
        "inline-block flex-none border px-[5px] py-px font-mono text-[10px] whitespace-nowrap text-ink",
        variant === "you" ? "border-ink tracking-[.1em]" : "border-line-2 tracking-[.08em]",
      )}
      data-testid={BoardTagTestId.Root}
      ref={ref}
      {...props}
    >
      {children}
    </span>
  );
}
