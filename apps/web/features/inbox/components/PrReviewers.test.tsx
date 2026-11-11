import type { InboxPrReviewers } from "@zibby/contracts";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { PrReviewers, PrReviewersTestId } from "./PrReviewers";

const hooks = vi.hoisted(() => ({
  data: undefined as InboxPrReviewers | undefined,
  mutate: vi.fn(),
}));
vi.mock("../queries", () => ({
  useInboxPrReviewersQuery: () => ({ data: hooks.data }),
}));
vi.mock("../mutations", () => ({
  useRequestInboxPrReviewMutation: () => ({
    mutate: hooks.mutate,
    isPending: false,
    variables: undefined,
  }),
}));

const ui = <PrReviewers number={7} projectId="api" />;

describe("PrReviewers", () => {
  beforeEach(() => {
    hooks.data = undefined;
    hooks.mutate.mockReset();
  });

  it("hides with no data or an empty tree", () => {
    renderWithProviders(ui);
    expect(screen.queryByTestId(PrReviewersTestId.Root)).toBeNull();
    hooks.data = { teams: [], users: [] };
    renderWithProviders(ui);
    expect(screen.queryByTestId(PrReviewersTestId.Root)).toBeNull();
  });

  it("renders teams with nested members, code-owner flag and per-person state", () => {
    hooks.data = {
      teams: [
        {
          slug: "web",
          name: "Web",
          codeOwner: true,
          requested: true,
          members: [{ login: "ann", state: "approved", commented: true }],
        },
        { slug: "ops", name: "Ops", codeOwner: false, requested: false, members: [] },
      ],
      users: [{ login: "bob", state: "pending", commented: false }],
    };
    renderWithProviders(ui);
    const teams = screen.getAllByTestId(PrReviewersTestId.Team);
    expect(teams).toHaveLength(2);
    expect(teams[0]).toHaveTextContent("Web");
    expect(screen.getAllByTestId(PrReviewersTestId.CodeOwner)).toHaveLength(1);
    const people = screen.getAllByTestId(PrReviewersTestId.Person);
    expect(people.map((p) => p.getAttribute("data-state"))).toEqual(["approved", "pending"]);
    expect(screen.getAllByTestId(PrReviewersTestId.Commented)).toHaveLength(1);
    expect(screen.queryByTestId(PrReviewersTestId.ReRequest)).toBeNull();
  });

  it("offers re-request only for changes-requested people and posts their login", () => {
    hooks.data = {
      teams: [],
      users: [
        { login: "cid", state: "changesRequested", commented: false },
        { login: "dan", state: "commented", commented: true },
      ],
    };
    renderWithProviders(ui);
    const btn = screen.getByTestId(PrReviewersTestId.ReRequest);
    expect(btn).toHaveAccessibleName("Znovu vyžádat review od cid");
    fireEvent.click(btn);
    expect(hooks.mutate).toHaveBeenCalledWith({
      params: { projectId: "api", number: 7 },
      body: { login: "cid" },
    });
  });
});
