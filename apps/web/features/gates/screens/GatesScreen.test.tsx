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
vi.mock("../../departments/queries", () => ({ useDepartmentsQuery: () => ({ data: [] }) }));
vi.mock("../../handoff", () => ({ useHandoffRulesQuery: () => ({ data: [] }) }));
vi.mock("../../handoff/components/HandoffRulesSection", () => ({
  HandoffRulesSection: () => <div>handoff-rules-section</div>,
}));
vi.mock("../../settings/components/MandateSection", () => ({
  MandateSection: () => <div>mandate-section</div>,
}));
vi.mock("../../signals/components/SignalsScreen", () => ({
  SignalsScreen: () => <div>signals-screen</div>,
}));
vi.mock("../../projects", () => ({ useProjectsQuery: () => ({ data: [] }) }));
vi.mock("../components/GateRulesSection", () => ({
  GateRulesSection: ({ hideFloor }: { hideFloor?: boolean }) => (
    <div>global-rules-section (hideFloor={String(Boolean(hideFloor))})</div>
  ),
}));
vi.mock("../components/SystemFloorPanel", () => ({
  SystemFloorPanel: () => <div>system-floor-panel</div>,
}));

describe("GatesScreen (ZB-08 ?section= router)", () => {
  beforeEach(() => {
    replace.mockClear();
    searchParams = new URLSearchParams();
  });

  it("defaults to the read-only floor panel", () => {
    render(<GatesScreen />);
    expect(screen.getByText("system-floor-panel")).toBeInTheDocument();
  });

  it("?section=global renders the global rules catalog with the floor hidden (I-1)", () => {
    searchParams = new URLSearchParams("section=global");
    render(<GatesScreen />);
    expect(screen.getByText("global-rules-section (hideFloor=true)")).toBeInTheDocument();
  });

  it("?section=signals renders the moved ex-/signals screen", () => {
    searchParams = new URLSearchParams("section=signals");
    render(<GatesScreen />);
    expect(screen.getByText("signals-screen")).toBeInTheDocument();
  });

  it("?section=mandate renders the moved ex-settings mandate section", () => {
    searchParams = new URLSearchParams("section=mandate");
    render(<GatesScreen />);
    expect(screen.getByText("mandate-section")).toBeInTheDocument();
  });

  it("an unknown section value falls back to the floor panel", () => {
    searchParams = new URLSearchParams("section=bogus");
    render(<GatesScreen />);
    expect(screen.getByText("system-floor-panel")).toBeInTheDocument();
  });
});
