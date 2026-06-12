import { Container } from "@zibby/design-system";
import type { ReactNode } from "react";

export interface PageContainerProps {
  stretch?: boolean;
  children: ReactNode;
}

/**
 * Centered, max-width page column shared by the single-column dashboard screens
 * (skills, integrations, agents, the pipelines empty state). Replaces the
 * repeated `<Container maxWidth="1400px" style={{ marginInline: "auto" }}>`.
 */
export function PageContainer({ stretch, children }: PageContainerProps) {
  return (
    <Container
      {...(stretch ? { width: "100%" } : { maxWidth: "1400px" })}
      style={{ marginInline: "auto" }}
    >
      {children}
    </Container>
  );
}
