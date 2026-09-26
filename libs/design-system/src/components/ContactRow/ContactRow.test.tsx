import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { ContactRow, ContactRowTestId } from "./ContactRow";

describe("ContactRow", () => {
  it("renders the monogram, name and sub line", () => {
    render(<ContactRow name="Jane Doe" sub="Product Owner" />);
    expect(screen.getByTestId(ContactRowTestId.Initial)).toHaveTextContent("J");
    expect(screen.getByTestId(ContactRowTestId.Name)).toHaveTextContent("Jane Doe");
    expect(screen.getByTestId(ContactRowTestId.Sub)).toHaveTextContent("Product Owner");
  });

  it("omits the sub line when not provided", () => {
    render(<ContactRow name="Jane Doe" />);
    expect(screen.queryByTestId(ContactRowTestId.Sub)).toBeNull();
  });

  it("renders and fires the vip toggle and remove action only when handlers are provided", async () => {
    const onToggleVip = vi.fn();
    const onRemove = vi.fn();
    const { rerender } = render(<ContactRow name="Jane Doe" />);
    expect(screen.queryByTestId(ContactRowTestId.Vip)).toBeNull();
    expect(screen.queryByTestId(ContactRowTestId.Remove)).toBeNull();

    rerender(
      <ContactRow name="Jane Doe" onRemove={onRemove} onToggleVip={onToggleVip} vip={false} />,
    );
    await userEvent.click(screen.getByTestId(ContactRowTestId.Vip));
    await userEvent.click(screen.getByTestId(ContactRowTestId.Remove));
    expect(onToggleVip).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("gives the remove button an accessible name", () => {
    render(<ContactRow name="Jane Doe" onRemove={() => {}} removeLabel="Remove contact" />);
    expect(screen.getByTestId(ContactRowTestId.Remove)).toHaveAccessibleName("Remove contact");
  });
});
