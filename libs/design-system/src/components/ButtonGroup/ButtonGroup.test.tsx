import { render, screen } from "@testing-library/react";
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
