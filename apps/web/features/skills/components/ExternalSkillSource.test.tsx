import { describe, expect, it } from "vitest";
import type { SkillSource } from "@zibby/contracts";
import { renderWithProviders as render, screen } from "../../../test/render";
import { ExternalSkillSource, ExternalSkillSourceTestId } from "./ExternalSkillSource";

const SOURCE: SkillSource = {
  owner: "cloudflare",
  repo: "skills",
  url: "https://github.com/cloudflare/skills",
  path: "security-audit",
  sha: "aaa",
  treeSha: "t1",
  installedAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  checkedAt: "2026-10-01T00:00:00Z",
};

describe("ExternalSkillSource", () => {
  it("renders the owner and the last update, no badge when up to date", () => {
    render(<ExternalSkillSource source={SOURCE} />);
    expect(screen.getByTestId(ExternalSkillSourceTestId.Owner)).toHaveTextContent("cloudflare");
    expect(screen.getByTestId(ExternalSkillSourceTestId.Updated)).not.toBeEmptyDOMElement();
    expect(screen.queryByTestId(ExternalSkillSourceTestId.UpdateBadge)).toBeNull();
    expect(screen.queryByTestId(ExternalSkillSourceTestId.Error)).toBeNull();
  });

  it("flags an available update and the last error", () => {
    render(<ExternalSkillSource source={{ ...SOURCE, latestSha: "bbb", lastError: "offline" }} />);
    expect(screen.getByTestId(ExternalSkillSourceTestId.UpdateBadge)).toHaveTextContent(
      "Dostupná aktualizace",
    );
    expect(screen.getByTestId(ExternalSkillSourceTestId.Error)).toHaveTextContent("offline");
  });
});
