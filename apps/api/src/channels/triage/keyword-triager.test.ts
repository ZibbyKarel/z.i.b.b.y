import { describe, expect, it } from "vitest";
import { KeywordTriager } from "./keyword-triager";

const t = new KeywordTriager();

describe("KeywordTriager", () => {
  it("routes a bug report to Tier 1 with a task suggestion", () => {
    const v = t.score("The app crashes on login, here is the stack trace");
    expect(v).toMatchObject({ actionable: true, tier: 1, category: "bug" });
    expect(v.suggestedTaskText).toBeTruthy();
  });

  it("routes a client question to Tier 2 with a reply draft", () => {
    const v = t.score("Can you share the latest status?");
    expect(v).toMatchObject({ actionable: true, tier: 2, category: "question" });
    expect(v.suggestedReply).toBeTruthy();
  });

  it("routes a scope/price request to Tier 3", () => {
    const v = t.score("Tady je nabídka a smlouva s deadline na příští týden");
    expect(v).toMatchObject({ actionable: true, tier: 3, category: "request" });
  });

  it("routes gibberish to Tier 3 with low confidence (unknown → higher tier)", () => {
    const v = t.score("asdf qwer zxcv");
    expect(v).toMatchObject({ actionable: true, tier: 3, category: "other" });
    expect(v.confidence).toBeLessThan(0.5);
  });

  it("does not fire on CS transactional link-fallback boilerplate (Samsung/DocuSign pattern)", () => {
    // "If the button above doesn't work, enter the address below in the browser."
    const v = t.score(
      "Pokud výše uvedené tlačítko nefunguje, zadejte do prohlížeče níže uvedenou adresu.",
    );
    expect(v.tier).not.toBe(1);
    expect(v.category).not.toBe("bug");
  });

  it("does not fire on EN transactional link-fallback boilerplate", () => {
    const v = t.score(
      "If the link above doesn't work, copy and paste the URL into your browser.",
    );
    expect(v.tier).not.toBe(1);
    expect(v.category).not.toBe("bug");
  });

  it("still routes a genuine CS bug report containing nefunguje to Tier 1", () => {
    const v = t.score("Aplikace nefunguje po posledním update, stránka se nenačítá.");
    expect(v).toMatchObject({ actionable: true, tier: 1, category: "bug" });
  });
});
