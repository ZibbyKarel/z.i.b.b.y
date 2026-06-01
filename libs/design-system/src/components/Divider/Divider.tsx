import { cn } from "../../utils/cn";

export enum DividerTestId {
  Root = "divider-root",
}

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
}

export function Divider({ orientation = "horizontal" }: DividerProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-border",
        orientation === "vertical" ? "w-px self-stretch" : "h-px w-full",
      )}
      data-testid={DividerTestId.Root}
      role="separator"
    />
  );
}
