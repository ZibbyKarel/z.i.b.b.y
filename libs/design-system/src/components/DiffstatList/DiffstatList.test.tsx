import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffstatList, DiffstatListTestId } from "./DiffstatList";

const FILES = [
  { path: "a.ts", additions: 10, deletions: 0 },
  { path: "b.ts", additions: 5, deletions: 5 },
];

describe("DiffstatList", () => {
  it("sizes bar segments relative to the largest change", () => {
    render(<DiffstatList files={FILES} />);
    expect(screen.getByTestId(`${DiffstatListTestId.BarAdd}-a.ts`)).toHaveStyle({ width: "100%" });
    expect(screen.getByTestId(`${DiffstatListTestId.BarDel}-a.ts`)).toHaveStyle({ width: "0%" });
    expect(screen.getByTestId(`${DiffstatListTestId.BarAdd}-b.ts`)).toHaveStyle({ width: "50%" });
    expect(screen.getByTestId(`${DiffstatListTestId.BarDel}-b.ts`)).toHaveStyle({ width: "50%" });
  });

  it("renders +N and a true minus sign for deletions", () => {
    render(<DiffstatList files={FILES} />);
    const row = screen.getByTestId(`${DiffstatListTestId.Row}-b.ts`);
    expect(row).toHaveTextContent("+5");
    expect(row).toHaveTextContent("−5");
    expect(row).not.toHaveTextContent("-5");
  });

  it("does not divide by zero for an all-zero list", () => {
    render(<DiffstatList files={[{ path: "bin", additions: 0, deletions: 0 }]} />);
    expect(screen.getByTestId(`${DiffstatListTestId.BarAdd}-bin`)).toHaveStyle({ width: "0%" });
  });

  it("table density draws the bordered panel", () => {
    const ref = createRef<HTMLDivElement>();
    render(<DiffstatList density="table" files={FILES} ref={ref} />);
    expect(screen.getByTestId(DiffstatListTestId.Root)).toHaveClass("border");
    expect(screen.getByTestId(`${DiffstatListTestId.Row}-a.ts`)).toHaveClass("border-b");
    expect(ref.current).toBe(screen.getByTestId(DiffstatListTestId.Root));
  });

  it("compact density has no row borders", () => {
    render(<DiffstatList files={FILES} />);
    expect(screen.getByTestId(DiffstatListTestId.Root)).not.toHaveClass("border");
    expect(screen.getByTestId(`${DiffstatListTestId.Row}-a.ts`)).not.toHaveClass("border-b");
  });
});
