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
      data-testid={DividerTestId.Root}
      aria-hidden
      role="separator"
      className={cn(
        "bg-border",
        orientation === "vertical" ? "w-px self-stretch" : "h-px w-full",
      )}
    />
  );
}
