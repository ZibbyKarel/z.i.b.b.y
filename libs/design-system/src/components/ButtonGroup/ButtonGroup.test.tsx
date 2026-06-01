import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ButtonGroup, ButtonGroupTestId } from "./ButtonGroup";
import type { ButtonGroupOption } from "./ButtonGroup";

const options: ButtonGroupOption[] = [
  { id: "home", label: "home", swatchClass: "bg-home" },
  { id: "work", label: "work", swatchClass: "bg-work" },
];

describe("ButtonGroup", () => {
  it("marks the active option as pressed", () => {
    render(
      <ButtonGroup options={options} value="home" onChange={() => {}} ariaLabel="Context" />,
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
      <ButtonGroup options={options} value="home" onChange={onChange} ariaLabel="Context" />,
    );
    await userEvent.click(screen.getByTestId(`${ButtonGroupTestId.Option}-work`));
    expect(onChange).toHaveBeenCalledWith("work");
  });

  it("renders the add affordance when onAdd is provided", async () => {
    const onAdd = vi.fn();
    render(
      <ButtonGroup
        options={options}
        value="home"
        onChange={() => {}}
        onAdd={onAdd}
        addLabel="Přidat kontext"
        ariaLabel="Context"
      />,
    );
    const add = screen.getByTestId(ButtonGroupTestId.Add);
    expect(add).toHaveAccessibleName("Přidat kontext");
    await userEvent.click(add);
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
