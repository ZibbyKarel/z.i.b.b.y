import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GatesScreen } from "./GatesScreen";

let searchParams = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("../../agents", () => ({ useAgentsQuery: () => ({ data: [] }) }));
vi.mock("../../settings/components/MandateSection", () => ({
  MandateSection: () => <div>mandate-section</div>,
}));
vi.mock("../../projects", () => ({ useProjectsQuery: () => ({ data: [] }) }));
vi.mock("../components/GateRulesSection", () => ({
  GateRulesSection: () => <div>global-rules-section</div>,
}));

describe("GatesScreen (ZB-08 ?section= router)", () => {
  beforeEach(() => {
    replace.mockClear();
    searchParams = new URLSearchParams();
  });

  it("defaults to the global rules section", () => {
    render(<GatesScreen />);
    expect(screen.getByText("global-rules-section")).toBeInTheDocument();
  });

  it("?section=global renders the unified global rules list", () => {
    searchParams = new URLSearchParams("section=global");
    render(<GatesScreen />);
    expect(screen.getByText("global-rules-section")).toBeInTheDocument();
  });

  it("the retired ?section=signals / handoff values fall back to the global rules section", () => {
    searchParams = new URLSearchParams("section=signals");
    render(<GatesScreen />);
    expect(screen.getByText("global-rules-section")).toBeInTheDocument();
  });

  it("?section=mandate renders the moved ex-settings mandate section", () => {
    searchParams = new URLSearchParams("section=mandate");
    render(<GatesScreen />);
    expect(screen.getByText("mandate-section")).toBeInTheDocument();
  });

  it("the retired ?section=floor link falls back to the global rules section", () => {
    searchParams = new URLSearchParams("section=floor");
    render(<GatesScreen />);
    expect(screen.getByText("global-rules-section")).toBeInTheDocument();
  });

  it("an unknown section value falls back to the floor panel", () => {
    searchParams = new URLSearchParams("section=bogus");
    render(<GatesScreen />);
    expect(screen.getByText("global-rules-section")).toBeInTheDocument();
  });
});
