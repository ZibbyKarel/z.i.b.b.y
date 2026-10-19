import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "../../../../test/render";
import messages from "../../../../i18n/messages/cs.json";
import { PrDiff, PrDiffTestId } from "./PrDiff";

const TWO_FILES = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
 const a = 1;
-const b = 2;
+const b = 3;
diff --git a/img.png b/img.png
index 333..444 100644
Binary files a/img.png and b/img.png differ
`;

const RENAME = `diff --git a/old.ts b/new.ts
similarity index 100%
rename from old.ts
rename to new.ts
`;

describe("PrDiff", () => {
  it("renders one section per file and a no-hunks note for binaries", () => {
    renderWithProviders(<PrDiff diff={TWO_FILES} />);
    expect(screen.getAllByTestId(PrDiffTestId.File)).toHaveLength(2);
    expect(screen.getAllByTestId(PrDiffTestId.FileName).map((n) => n.textContent)).toEqual([
      "src/a.ts",
      "img.png",
    ]);
    expect(screen.getByTestId(PrDiffTestId.NoHunks)).toHaveTextContent(
      messages.inboxPage.prs.diff.noHunks,
    );
  });

  it("shows the empty state for an empty diff", () => {
    renderWithProviders(<PrDiff diff="" />);
    expect(screen.getByTestId(PrDiffTestId.Empty)).toHaveTextContent(
      messages.inboxPage.prs.diff.empty,
    );
  });

  it("shows old → new for a rename", () => {
    renderWithProviders(<PrDiff diff={RENAME} />);
    expect(screen.getByTestId(PrDiffTestId.FileName)).toHaveTextContent("old.ts → new.ts");
  });
});
