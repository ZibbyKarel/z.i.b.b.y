import { cn } from "../../utils/cn";

export enum DividerTestId {
  Root = "divider-root",
}

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
}

export function Divider({ orientation = "horizontal" }: DividerProps) {
  return (
    // Purely decorative in every current usage (a visual rule between form rows/
    // sections) — no consumer relies on it being announced, so it stays
    // aria-hidden. `role="separator"` was dropped: paired with aria-hidden it was
    // inert and contradictory (the role is stripped from the accessibility tree
    // once the element is hidden from it).
    <span
      aria-hidden
      className={cn("bg-border", orientation === "vertical" ? "w-px self-stretch" : "h-px w-full")}
      data-testid={DividerTestId.Root}
    />
  );
}
