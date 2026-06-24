import type { UseQueryResult } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../test/render";
import { QueryBoundary } from "./QueryBoundary";
import { LoadErrorTestId } from "../LoadError/LoadError";
import { LoadingStateTestId } from "../LoadingState/LoadingState";

/** Minimal `useQuery` result in a single state — enough to drive the boundary's branches. */
function fakeQuery<TData>(state: {
  isError?: boolean;
  isPending?: boolean;
  data?: TData;
  refetch?: () => void;
}): UseQueryResult<TData> {
  return {
    isError: false,
    isPending: false,
    refetch: () => {},
    ...state,
  } as unknown as UseQueryResult<TData>;
}

describe("QueryBoundary", () => {
  it("renders the loading state while the query is pending", () => {
    renderWithProviders(
      <QueryBoundary query={fakeQuery<string>({ isPending: true })}>
        {(data) => <div>{data}</div>}
      </QueryBoundary>,
    );
    expect(screen.getByTestId(LoadingStateTestId.Root)).toBeInTheDocument();
  });

  it("renders the error state with a retry wired to refetch", async () => {
    const refetch = vi.fn();
    renderWithProviders(
      <QueryBoundary query={fakeQuery<string>({ isError: true, refetch })}>
        {(data) => <div>{data}</div>}
      </QueryBoundary>,
    );
    const retry = screen.getByTestId(LoadErrorTestId.Retry);
    retry.click();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("hands the resolved data to the render-prop child on success", () => {
    renderWithProviders(
      <QueryBoundary query={fakeQuery<string>({ data: "rohlik" })}>
        {(data) => <div>{data.toUpperCase()}</div>}
      </QueryBoundary>,
    );
    expect(screen.getByText("ROHLIK")).toBeInTheDocument();
    expect(screen.queryByTestId(LoadingStateTestId.Root)).toBeNull();
    expect(screen.queryByTestId(LoadErrorTestId.Root)).toBeNull();
  });

  it("renders a plain node child on success", () => {
    renderWithProviders(
      <QueryBoundary query={fakeQuery<string>({ data: "wolt" })}>
        <div>plain</div>
      </QueryBoundary>,
    );
    expect(screen.getByText("plain")).toBeInTheDocument();
  });
});
