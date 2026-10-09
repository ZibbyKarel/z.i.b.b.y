import { Container } from "@zibby/design-system";
import type { ReactNode } from "react";

export interface PageContainerProps {
  children: ReactNode;
}

/**
 * Full-width page column shared by the single-column dashboard screens
 * (skills, integrations, agents, knowledge, the workflows empty state). Page
 * content always spans the whole available width (TODO 8) — no max-width cap.
 */
export function PageContainer({ children }: PageContainerProps) {
  return <Container width="100%">{children}</Container>;
}
