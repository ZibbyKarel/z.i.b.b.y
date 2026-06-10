import { Container } from "@zibby/design-system";
import type { ReactNode } from "react";

export interface PageContainerProps {
  /** Max content width; defaults to the dashboard's 1400px reading column. */
  maxWidth?: string;
  children: ReactNode;
}

/**
 * Centered, max-width page column shared by the single-column dashboard screens
 * (skills, integrations, agents, the pipelines empty state). Replaces the
 * repeated `<Container maxWidth="1400px" style={{ marginInline: "auto" }}>`.
 */
export function PageContainer({
  maxWidth = "1400px",
  children,
}: PageContainerProps) {
  return (
    <Container maxWidth={maxWidth} style={{ marginInline: "auto" }}>
      {children}
    </Container>
  );
}
