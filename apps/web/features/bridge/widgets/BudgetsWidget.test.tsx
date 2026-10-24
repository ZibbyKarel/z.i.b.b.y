import { LoadErrorTestId } from "../../../components/LoadError/LoadError";
import { ProgressTestId } from "@zibby/design-system";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
import type { BridgeWidget } from "../grid/layout";
import { BudgetsWidget, BudgetsWidgetTestId } from "./BudgetsWidget";
import type { BridgeWidgetProps } from "./registry";

const d = vi.hoisted(() => ({
  budget: undefined as unknown,
  projects: [] as unknown[],
  companies: [] as unknown[],
  pending: false,
  error: false,
}));

vi.mock("../../projects/queries", () => ({
  useBudgetQuery: () => ({
    data: d.budget,
    isPending: d.pending,
    isError: d.error,
    refetch: vi.fn(),
  }),
  useProjectsQuery: () => ({ data: d.projects, isPending: false, isError: false }),
}));
vi.mock("../../companies/queries", () => ({
  useCompaniesQuery: () => ({ data: d.companies, isPending: false, isError: false }),
}));

const widget: BridgeWidget = { id: "w-b", type: "budgets", x: 0, y: 0, w: 4, h: 8 };
const setup = (): BridgeWidgetProps => ({
  widget,
  editing: false,
  onEmptyChange: vi.fn(),
  onCountChange: vi.fn(),
  selection: null,
  onOpen: vi.fn(),
  epicClosed: {},
  onEpicToggle: vi.fn(),
  onScopeChange: vi.fn(),
});

const global = (over: Record<string, unknown> = {}) => ({
  rolling: { usedPct: 10, resetsAt: null },
  weekly: { usedPct: 10, resetsAt: null },
  stale: false,
  paused: false,
  ...over,
});
const proj = (id: string, over: Record<string, unknown> = {}) => ({
  projectId: id,
  name: id.toUpperCase(),
  daily: { used: 0 },
  weekly: { used: 0 },
  running: 0,
  queued: 0,
  held: 0,
  ...over,
});
const usd = (n: number) =>
  new Intl.NumberFormat("cs", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);

beforeEach(() => {
  d.budget = { global: global(), projects: [] };
  d.projects = [];
  d.companies = [];
  d.pending = false;
  d.error = false;
});

const rows = () => screen.getAllByTestId(BudgetsWidgetTestId.Row);

describe("BudgetsWidget", () => {
  it("renders a near project row as a link with name, badge, used/cap, axis and percent", () => {
    d.budget = {
      global: global({ stale: true }),
      projects: [proj("a", { daily: { used: 8, cap: 10 } })],
    };
    renderWithProviders(<BudgetsWidget {...setup()} />);
    const [row] = rows();
    expect(row).toHaveAttribute("href", "/projects/a");
    expect(within(row as HTMLElement).getByTestId(BudgetsWidgetTestId.Name)).toHaveTextContent("A");
    expect(within(row as HTMLElement).getByTestId(BudgetsWidgetTestId.Badge)).toHaveTextContent(
      "dochází",
    );
    expect(within(row as HTMLElement).getByTestId(BudgetsWidgetTestId.Usage)).toHaveTextContent(
      "8/10 dnes",
    );
    expect(within(row as HTMLElement).getByTestId(BudgetsWidgetTestId.Percent)).toHaveTextContent(
      "80 %",
    );
  });

  it("exhausted badge copy, none for ok, held copy and Progress tone", () => {
    d.budget = {
      global: global({ stale: true }),
      projects: [
        proj("full", { daily: { used: 10, cap: 10 }, held: 2 }),
        proj("fine", { daily: { used: 1, cap: 10 } }),
      ],
    };
    renderWithProviders(<BudgetsWidget {...setup()} />);
    const [full, fine] = rows() as [HTMLElement, HTMLElement];
    expect(within(full).getByTestId(BudgetsWidgetTestId.Badge)).toHaveTextContent("vyčerpáno");
    expect(within(full).getByTestId(BudgetsWidgetTestId.Held)).toHaveTextContent(
      "2 čeká nad limitem",
    );
    expect(within(fine).queryByTestId(BudgetsWidgetTestId.Badge)).not.toBeInTheDocument();
    expect(within(fine).queryByTestId(BudgetsWidgetTestId.Held)).not.toBeInTheDocument();
    expect(within(full).getByTestId(ProgressTestId.Root)).toBeInTheDocument();
  });

  it("formats dollars and links a company rollup to /companies/<id>", () => {
    d.companies = [{ id: "c1", name: "Acme" }];
    d.projects = [{ id: "a", companyId: "c1" }];
    d.budget = {
      global: global({ stale: true }),
      projects: [proj("a", { monthlyCost: { spentUsd: 12.3, capUsd: 50 } })],
    };
    renderWithProviders(<BudgetsWidget {...setup()} />);
    const all = rows();
    expect(all).toHaveLength(2);
    const company = all.find((r) => r.getAttribute("href") === "/companies/c1") as HTMLElement;
    const nbsp = (x: string | null) => (x ?? "").replace(/\s/g, " ");
    expect(nbsp(within(company).getByTestId(BudgetsWidgetTestId.Usage).textContent)).toBe(
      nbsp(`${usd(12.3)}/${usd(50)} měsíc $`),
    );
  });

  it("limit rows show the i18n label and link to /governance/budgets", () => {
    d.budget = { global: global({ rolling: { usedPct: 85, resetsAt: null } }), projects: [] };
    renderWithProviders(<BudgetsWidget {...setup()} />);
    const [rolling, weekly] = rows() as [HTMLElement, HTMLElement];
    expect(rolling).toHaveAttribute("href", "/governance/budgets");
    expect(within(rolling).getByTestId(BudgetsWidgetTestId.Name)).toHaveTextContent("Limit 5 h");
    expect(within(weekly).getByTestId(BudgetsWidgetTestId.Name)).toHaveTextContent("Týdenní limit");
    expect(within(rolling).getByTestId(BudgetsWidgetTestId.Percent)).toHaveTextContent("85 %");
  });

  it("reports count, you and the exhausted aside", () => {
    d.budget = {
      global: global({ stale: true }),
      projects: [
        proj("full", { daily: { used: 10, cap: 10 } }),
        proj("near", { daily: { used: 9, cap: 10 } }),
        proj("ok", { daily: { used: 1, cap: 10 } }),
      ],
    };
    const props = setup();
    renderWithProviders(<BudgetsWidget {...props} />);
    expect(props.onCountChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 3, you: 2, aside: "1 vyčerpáno" }),
    );
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(false);
  });

  it("stale limits give the limits-unknown aside", () => {
    d.budget = {
      global: global({ stale: true }),
      projects: [proj("a", { daily: { used: 1, cap: 10 } })],
    };
    const props = setup();
    renderWithProviders(<BudgetsWidget {...props} />);
    expect(props.onCountChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ aside: "limity neznámé" }),
    );
  });

  it("shows the empty copy and reports empty", () => {
    d.budget = { global: global({ stale: true }), projects: [] };
    const props = setup();
    renderWithProviders(<BudgetsWidget {...props} />);
    expect(screen.getByTestId(BudgetsWidgetTestId.Empty)).toHaveTextContent(
      "Žádné budgety ani limity nejsou nastavené.",
    );
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(true);
  });

  it("reports loading while the budget is pending", () => {
    d.budget = undefined;
    d.pending = true;
    const props = setup();
    renderWithProviders(<BudgetsWidget {...props} />);
    expect(props.onCountChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ loading: true, count: undefined }),
    );
    expect(screen.queryByTestId(BudgetsWidgetTestId.Empty)).not.toBeInTheDocument();
  });

  it("a query error renders QueryError and does not report empty", () => {
    d.budget = undefined;
    d.error = true;
    const props = setup();
    renderWithProviders(<BudgetsWidget {...props} />);
    expect(screen.getByTestId(LoadErrorTestId.Root)).toBeInTheDocument();
    expect(props.onEmptyChange).toHaveBeenLastCalledWith(false);
  });
});
