import { renderWithProviders as render, screen, within } from "../../../test/render";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NO_SUBSYSTEM } from "../archiveGroups";
import { ArchiveSubsystemFilter, ArchiveSubsystemFilterTestId } from "./ArchiveSubsystemFilter";

describe("ArchiveSubsystemFilter", () => {
  it("shows the 'all subsystems' label when nothing is selected, and stays closed until clicked", () => {
    render(<ArchiveSubsystemFilter counts={{}} onChange={vi.fn()} selected={[]} total={7} />);

    // The trigger's own label reads "all subsystems" — the total only surfaces
    // inside the open panel's "All" option (asserted in the next test).
    expect(screen.getByTestId(ArchiveSubsystemFilterTestId.Trigger)).toHaveTextContent(
      "Všechny subsystémy",
    );
    expect(screen.queryByTestId(ArchiveSubsystemFilterTestId.Panel)).not.toBeInTheDocument();
  });

  it("opens the panel on trigger click, listing every subsystem plus 'bez subsystému' with counts", () => {
    render(
      <ArchiveSubsystemFilter
        counts={{ forge: 3, [NO_SUBSYSTEM]: 2 }}
        onChange={vi.fn()}
        selected={[]}
        total={5}
      />,
    );

    fireEvent.click(screen.getByTestId(ArchiveSubsystemFilterTestId.Trigger));
    const panel = screen.getByTestId(ArchiveSubsystemFilterTestId.Panel);
    expect(within(panel).getByTestId(ArchiveSubsystemFilterTestId.AllOption)).toHaveTextContent(
      "5",
    );

    const options = within(panel).getAllByTestId(ArchiveSubsystemFilterTestId.Option);
    // 11 subsystems + 1 "bez subsystému" pseudo option.
    expect(options).toHaveLength(12);
    const forgeOption = options.find((o) => o.getAttribute("data-subsystem-id") === "forge");
    expect(forgeOption).toHaveTextContent("Forge");
    expect(forgeOption).toHaveTextContent("3");
    const noneOption = options.find((o) => o.getAttribute("data-subsystem-id") === NO_SUBSYSTEM);
    expect(noneOption).toHaveTextContent("2");
  });

  it("toggles a subsystem into the selection on click, and back out on a second click", () => {
    const onChange = vi.fn();
    render(<ArchiveSubsystemFilter counts={{}} onChange={onChange} selected={[]} total={0} />);

    fireEvent.click(screen.getByTestId(ArchiveSubsystemFilterTestId.Trigger));
    const forgeRow = screen
      .getAllByTestId(ArchiveSubsystemFilterTestId.Option)
      .find((o) => o.getAttribute("data-subsystem-id") === "forge")!;
    fireEvent.click(forgeRow);
    expect(onChange).toHaveBeenCalledWith(["forge"]);
  });

  it("clicking 'all subsystems' clears the selection", () => {
    const onChange = vi.fn();
    render(
      <ArchiveSubsystemFilter counts={{}} onChange={onChange} selected={["forge"]} total={0} />,
    );

    fireEvent.click(screen.getByTestId(ArchiveSubsystemFilterTestId.Trigger));
    fireEvent.click(screen.getByTestId(ArchiveSubsystemFilterTestId.AllOption));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("selecting NO_SUBSYSTEM is a real, distinct option — never silently merged into 'all'", () => {
    const onChange = vi.fn();
    render(<ArchiveSubsystemFilter counts={{}} onChange={onChange} selected={[]} total={0} />);

    fireEvent.click(screen.getByTestId(ArchiveSubsystemFilterTestId.Trigger));
    const noneRow = screen
      .getAllByTestId(ArchiveSubsystemFilterTestId.Option)
      .find((o) => o.getAttribute("data-subsystem-id") === NO_SUBSYSTEM)!;
    fireEvent.click(noneRow);
    expect(onChange).toHaveBeenCalledWith([NO_SUBSYSTEM]);
  });

  it("closes when clicking outside the component", () => {
    render(<ArchiveSubsystemFilter counts={{}} onChange={vi.fn()} selected={[]} total={0} />);

    fireEvent.click(screen.getByTestId(ArchiveSubsystemFilterTestId.Trigger));
    expect(screen.getByTestId(ArchiveSubsystemFilterTestId.Panel)).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId(ArchiveSubsystemFilterTestId.Panel)).not.toBeInTheDocument();
  });
});
