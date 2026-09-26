import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { APP_FRAME_MAIN_CONTENT_ID, AppFrame, AppFrameTestId } from "./AppFrame";

describe("AppFrame", () => {
  it("renders the header, subnav, rail and children slots", () => {
    render(
      <AppFrame
        header={<div>The header</div>}
        rail={<div>The rail</div>}
        subnav={<div>The subnav</div>}
      >
        <div>The content</div>
      </AppFrame>,
    );
    expect(screen.getByTestId(AppFrameTestId.Header)).toHaveTextContent("The header");
    expect(screen.getByTestId(AppFrameTestId.SubNav)).toHaveTextContent("The subnav");
    expect(screen.getByTestId(AppFrameTestId.Rail)).toHaveTextContent("The rail");
    expect(screen.getByTestId(AppFrameTestId.Main)).toHaveTextContent("The content");
  });

  it("omits the subnav, rail and dock slots when not provided", () => {
    render(<AppFrame header={<div>Header</div>}>Content</AppFrame>);
    expect(screen.queryByTestId(AppFrameTestId.SubNav)).toBeNull();
    expect(screen.queryByTestId(AppFrameTestId.Rail)).toBeNull();
    expect(screen.queryByTestId(AppFrameTestId.RailToggle)).toBeNull();
    expect(screen.queryByTestId(AppFrameTestId.Dock)).toBeNull();
  });

  it("renders the dock slot", () => {
    render(
      <AppFrame dock={<div>The dock</div>} header={<div>Header</div>}>
        Content
      </AppFrame>,
    );
    expect(screen.getByTestId(AppFrameTestId.Dock)).toHaveTextContent("The dock");
  });

  it("renders the main landmark with the shared skip-link target id", () => {
    render(<AppFrame header={<div>Header</div>}>Content</AppFrame>);
    expect(screen.getByTestId(AppFrameTestId.Main)).toHaveAttribute(
      "id",
      APP_FRAME_MAIN_CONTENT_ID,
    );
  });

  it("renders a skip link pointing at the main landmark", () => {
    render(<AppFrame header={<div>Header</div>}>Content</AppFrame>);
    const link = screen.getByTestId(AppFrameTestId.SkipLink);
    expect(link).toHaveAttribute("href", `#${APP_FRAME_MAIN_CONTENT_ID}`);
    expect(link).toHaveTextContent("Skip to main content");
  });

  it("accepts a custom skip-link label", () => {
    render(
      <AppFrame header={<div>Header</div>} skipLinkLabel="Přeskočit na obsah">
        Content
      </AppFrame>,
    );
    expect(screen.getByTestId(AppFrameTestId.SkipLink)).toHaveTextContent("Přeskočit na obsah");
  });

  it("renders a labelled mobile rail toggle that opens and closes the drawer", async () => {
    const user = userEvent.setup();
    render(
      <AppFrame header={<div>Header</div>} rail={<div>Rail content</div>}>
        Content
      </AppFrame>,
    );
    const toggle = screen.getByTestId(AppFrameTestId.RailToggle);
    expect(toggle).toHaveAccessibleName("Needs you");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId(AppFrameTestId.RailBackdrop)).toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId(AppFrameTestId.RailBackdrop)).toBeInTheDocument();

    await user.click(screen.getByTestId(AppFrameTestId.RailBackdrop));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("uses a custom railToggleLabel", () => {
    render(
      <AppFrame header={<div>Header</div>} rail={<div>Rail</div>} railToggleLabel="Approvals">
        Content
      </AppFrame>,
    );
    expect(screen.getByTestId(AppFrameTestId.RailToggle)).toHaveAccessibleName("Approvals");
  });

  it("pins its single column to minmax(0,1fr) so a wide header can never widen the frame", () => {
    render(
      <AppFrame header={<div>header</div>}>
        <p>content</p>
      </AppFrame>,
    );
    // An implicit `auto` track grows to the header's min-content width, which
    // clipped page content off a 390px viewport (ZB-14 finding).
    expect(screen.getByTestId(AppFrameTestId.Root)).toHaveStyle({
      gridTemplateColumns: "minmax(0,1fr)",
    });
  });
});
