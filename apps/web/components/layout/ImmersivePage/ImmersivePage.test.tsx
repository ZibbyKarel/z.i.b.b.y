import { ImmersiveShellTestId } from "@zibby/design-system";
import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ImmersivePage, ImmersivePageTestId } from "./ImmersivePage";

describe("ImmersivePage", () => {
  it("renders the shell with title/subtitle and body content", () => {
    renderWithProviders(
      <ImmersivePage subtitle="Vše, co ZIBBY dokončil" title="Archiv úloh">
        <div>obsah stránky</div>
      </ImmersivePage>,
    );
    expect(screen.getByTestId(ImmersiveShellTestId.Title)).toHaveTextContent("Archiv úloh");
    expect(screen.getByTestId(ImmersiveShellTestId.Subtitle)).toHaveTextContent(
      "Vše, co ZIBBY dokončil",
    );
    expect(screen.getByTestId(ImmersiveShellTestId.Body)).toHaveTextContent("obsah stránky");
  });

  it("supplies a back link defaulting to /chat, with a translated accessible name", () => {
    renderWithProviders(
      <ImmersivePage title="Archiv úloh">
        <div>obsah</div>
      </ImmersivePage>,
    );
    const back = screen.getByTestId(ImmersivePageTestId.Back);
    expect(back).toHaveRole("link");
    expect(back).toHaveAttribute("href", "/chat");
    expect(back).toHaveAccessibleName("Zpět");
  });

  it("overrides the back href when backHref is given", () => {
    renderWithProviders(
      <ImmersivePage backHref="/settings" title="Archiv úloh">
        <div>obsah</div>
      </ImmersivePage>,
    );
    expect(screen.getByTestId(ImmersivePageTestId.Back)).toHaveAttribute("href", "/settings");
  });
});
