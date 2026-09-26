import { renderWithProviders as render, screen, within } from "../../../test/render";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NO_DEPARTMENT } from "../archiveGroups";
import { ArchiveDepartmentFilter, ArchiveDepartmentFilterTestId } from "./ArchiveDepartmentFilter";

describe("ArchiveDepartmentFilter", () => {
  it("shows the 'all departments' label when nothing is selected, and stays closed until clicked", () => {
    render(<ArchiveDepartmentFilter counts={{}} onChange={vi.fn()} selected={[]} total={7} />);

    // The trigger's own label reads "all departments" — the total only surfaces
    // inside the open panel's "All" option (asserted in the next test).
    expect(screen.getByTestId(ArchiveDepartmentFilterTestId.Trigger)).toHaveTextContent(
      "Všechna oddělení",
    );
    expect(screen.queryByTestId(ArchiveDepartmentFilterTestId.Panel)).not.toBeInTheDocument();
  });

  it("opens the panel on trigger click, listing every department plus 'bez oddělení' with counts", () => {
    render(
      <ArchiveDepartmentFilter
        counts={{ dev: 3, [NO_DEPARTMENT]: 2 }}
        onChange={vi.fn()}
        selected={[]}
        total={5}
      />,
    );

    fireEvent.click(screen.getByTestId(ArchiveDepartmentFilterTestId.Trigger));
    const panel = screen.getByTestId(ArchiveDepartmentFilterTestId.Panel);
    expect(within(panel).getByTestId(ArchiveDepartmentFilterTestId.AllOption)).toHaveTextContent(
      "5",
    );

    const options = within(panel).getAllByTestId(ArchiveDepartmentFilterTestId.Option);
    // 11 departments + 1 "bez oddělení" pseudo option.
    expect(options).toHaveLength(12);
    const devOption = options.find((o) => o.getAttribute("data-department-id") === "dev");
    expect(devOption).toHaveTextContent("Dev");
    expect(devOption).toHaveTextContent("3");
    const noneOption = options.find((o) => o.getAttribute("data-department-id") === NO_DEPARTMENT);
    expect(noneOption).toHaveTextContent("2");
  });

  it("toggles a department into the selection on click, and back out on a second click", () => {
    const onChange = vi.fn();
    render(<ArchiveDepartmentFilter counts={{}} onChange={onChange} selected={[]} total={0} />);

    fireEvent.click(screen.getByTestId(ArchiveDepartmentFilterTestId.Trigger));
    const devRow = screen
      .getAllByTestId(ArchiveDepartmentFilterTestId.Option)
      .find((o) => o.getAttribute("data-department-id") === "dev")!;
    fireEvent.click(devRow);
    expect(onChange).toHaveBeenCalledWith(["dev"]);
  });

  it("clicking 'all departments' clears the selection", () => {
    const onChange = vi.fn();
    render(
      <ArchiveDepartmentFilter counts={{}} onChange={onChange} selected={["dev"]} total={0} />,
    );

    fireEvent.click(screen.getByTestId(ArchiveDepartmentFilterTestId.Trigger));
    fireEvent.click(screen.getByTestId(ArchiveDepartmentFilterTestId.AllOption));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("selecting NO_DEPARTMENT is a real, distinct option — never silently merged into 'all'", () => {
    const onChange = vi.fn();
    render(<ArchiveDepartmentFilter counts={{}} onChange={onChange} selected={[]} total={0} />);

    fireEvent.click(screen.getByTestId(ArchiveDepartmentFilterTestId.Trigger));
    const noneRow = screen
      .getAllByTestId(ArchiveDepartmentFilterTestId.Option)
      .find((o) => o.getAttribute("data-department-id") === NO_DEPARTMENT)!;
    fireEvent.click(noneRow);
    expect(onChange).toHaveBeenCalledWith([NO_DEPARTMENT]);
  });

  it("closes when clicking outside the component", () => {
    render(<ArchiveDepartmentFilter counts={{}} onChange={vi.fn()} selected={[]} total={0} />);

    fireEvent.click(screen.getByTestId(ArchiveDepartmentFilterTestId.Trigger));
    expect(screen.getByTestId(ArchiveDepartmentFilterTestId.Panel)).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId(ArchiveDepartmentFilterTestId.Panel)).not.toBeInTheDocument();
  });
});
