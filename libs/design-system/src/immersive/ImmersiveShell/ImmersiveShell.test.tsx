import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImmersiveShell, ImmersiveShellTestId } from "./ImmersiveShell";

describe("ImmersiveShell", () => {
  it("renders the title, subtitle and body content", () => {
    render(
      <ImmersiveShell subtitle="Vše, co ZIBBY dokončil" title="Archiv úloh">
        <div>obsah stránky</div>
      </ImmersiveShell>,
    );
    const title = screen.getByTestId(ImmersiveShellTestId.Title);
    expect(title).toHaveRole("heading");
    expect(title).toHaveAccessibleName("Archiv úloh");
    expect(screen.getByTestId(ImmersiveShellTestId.Subtitle)).toHaveTextContent(
      "Vše, co ZIBBY dokončil",
    );
    expect(screen.getByTestId(ImmersiveShellTestId.Body)).toHaveTextContent("obsah stránky");
  });

  it("omits the subtitle node when none is given", () => {
    render(
      <ImmersiveShell title="Archiv úloh">
        <div>obsah</div>
      </ImmersiveShell>,
    );
    expect(screen.queryByTestId(ImmersiveShellTestId.Subtitle)).not.toBeInTheDocument();
  });

  it("renders the back slot content inside the leading round frame when given", () => {
    render(
      <ImmersiveShell backSlot={<a href="/chat">zpět</a>} title="Archiv úloh">
        <div>obsah</div>
      </ImmersiveShell>,
    );
    const back = screen.getByTestId(ImmersiveShellTestId.Back);
    expect(back).toHaveTextContent("zpět");
  });

  it("omits the back frame entirely when no backSlot is given", () => {
    render(
      <ImmersiveShell title="Archiv úloh">
        <div>obsah</div>
      </ImmersiveShell>,
    );
    expect(screen.queryByTestId(ImmersiveShellTestId.Back)).not.toBeInTheDocument();
  });

  it("renders the actions cluster only when given", () => {
    const { rerender } = render(
      <ImmersiveShell title="Archiv úloh">
        <div>obsah</div>
      </ImmersiveShell>,
    );
    expect(screen.queryByTestId(ImmersiveShellTestId.Actions)).not.toBeInTheDocument();

    rerender(
      <ImmersiveShell actions={<button type="button">Filtrovat</button>} title="Archiv úloh">
        <div>obsah</div>
      </ImmersiveShell>,
    );
    expect(screen.getByTestId(ImmersiveShellTestId.Actions)).toHaveTextContent("Filtrovat");
  });

  it("is a full-height, non-scrolling flex column with a scrollable body", () => {
    render(
      <ImmersiveShell title="Archiv úloh">
        <div>obsah</div>
      </ImmersiveShell>,
    );
    const root = screen.getByTestId(ImmersiveShellTestId.Root);
    expect(root.style.height).toBe("100dvh");
    expect(root.style.overflow).toBe("hidden");
    expect(root.style.flexDirection).toBe("column");

    const body = screen.getByTestId(ImmersiveShellTestId.Body);
    expect(body.style.overflow).toBe("auto");
  });

  it("bands the header in a fixed-height GlassSurface with the panel radius", () => {
    render(
      <ImmersiveShell title="Archiv úloh">
        <div>obsah</div>
      </ImmersiveShell>,
    );
    const header = screen.getByTestId(ImmersiveShellTestId.Header);
    expect(header.style.borderRadius).toBe("10px");
    expect(header.style.flex).toBe("0 0 auto");
  });
});
