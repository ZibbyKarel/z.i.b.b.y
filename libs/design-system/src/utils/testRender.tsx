import { render as rtlRender } from "@testing-library/react";
import { DesignSystemProvider } from "../DesignSystemContext";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <DesignSystemProvider theme="dark">{children}</DesignSystemProvider>;
}

export function render(ui: React.ReactNode) {
  return rtlRender(ui, { wrapper: Wrapper });
}
