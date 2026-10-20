import type { HTMLAttributes, ReactNode, Ref } from "react";

export enum IndentRailTestId {
  Root = "indent-rail",
}

export interface IndentRailProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/** A nested block indented 20px behind a hairline strong-border rail — children of a parent row (stacked PRs). */
export function IndentRail({ children, ref, ...props }: IndentRailProps) {
  return (
    <div
      className="ml-5 flex flex-col border-l border-border-strong"
      data-testid={IndentRailTestId.Root}
      ref={ref}
      {...props}
    >
      {children}
    </div>
  );
}
