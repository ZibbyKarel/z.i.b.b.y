import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ButtonGroup, ButtonGroupTestId } from "./ButtonGroup";
import type { ButtonGroupOption } from "./ButtonGroup";

const options: ButtonGroupOption[] = [
  { id: "home", label: "home", tone: "home" },
  { id: "work", label: "work", tone: "work" },
];

describe("ButtonGroup", () => {
  it("marks the active option as pressed", () => {
    render(
      <ButtonGroup ariaLabel="Context" onChange={() => {}} options={options} value="home" />,
    );
    expect(screen.getByTestId(`${ButtonGroupTestId.Option}-home`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId(`${ButtonGroupTestId.Option}-work`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onChange on click", async () => {
    const onChange = vi.fn();
    render(
      <ButtonGroup ariaLabel="Context" onChange={onChange} options={options} value="home" />,
    );
    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-work`));
    expect(onChange).toHaveBeenCalledWith("work");
  });

  it("clears the selection when the active option is clicked in deselectable mode", async () => {
    const onChange = vi.fn();
    render(
      <ButtonGroup
        deselectable
        ariaLabel="Context"
        onChange={onChange}
        options={options}
        value="home"
      />,
    );
    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-home`));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("does not clear on active click by default", async () => {
    const onChange = vi.fn();
    render(
      <ButtonGroup ariaLabel="Context" onChange={onChange} options={options} value="home" />,
    );
    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-home`));
    expect(onChange).toHaveBeenCalledWith("home");
  });

  it("renders no option as pressed when value matches nothing", () => {
    render(<ButtonGroup ariaLabel="Context" onChange={() => {}} options={options} value="" />);
    expect(screen.getByTestId(`${ButtonGroupTestId.Option}-home`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId(`${ButtonGroupTestId.Option}-work`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders leading and trailing slot content for an option", () => {
    const withSlots: ButtonGroupOption[] = [
      {
        id: "allow",
        label: "allow",
        leading: <span data-testid="lead-icon" />,
        trailing: <span data-testid="trail-count">3</span>,
      },
    ];
    render(
      <ButtonGroup ariaLabel="Decision" onChange={() => {}} options={withSlots} value="allow" />,
    );
    const lead = screen.getByTestId(`${ButtonGroupTestId.Leading}-allow`);
    const trail = screen.getByTestId(`${ButtonGroupTestId.Trailing}-allow`);
    expect(within(lead).getByTestId("lead-icon")).toBeInTheDocument();
    expect(within(trail).getByTestId("trail-count")).toHaveTextContent("3");
  });

  it("omits slot wrappers when no slot content is provided", () => {
    render(
      <ButtonGroup ariaLabel="Context" onChange={() => {}} options={options} value="home" />,
    );
    expect(screen.queryByTestId(`${ButtonGroupTestId.Leading}-home`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`${ButtonGroupTestId.Trailing}-home`)).not.toBeInTheDocument();
  });

  it("renders the add affordance when onAdd is provided", async () => {
    const onAdd = vi.fn();
    render(
      <ButtonGroup
        addLabel="Přidat kontext"
        ariaLabel="Context"
        onAdd={onAdd}
        onChange={() => {}}
        options={options}
        value="home"
      />,
    );
    const add = screen.getByTestId(ButtonGroupTestId.Add);
    expect(add).toHaveAccessibleName("Přidat kontext");
    await userEvent.click(add);
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
