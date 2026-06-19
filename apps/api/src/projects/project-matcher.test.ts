import type { Project } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { matchProject } from "./project-matcher";

const project = (over: Partial<Project> & Pick<Project, "id" | "name" | "path">): Project => over;

describe("matchProject", () => {
  const alpha = project({ id: "alpha", name: "Alpha", path: "/work/alpha" });
  const alphaWeb = project({ id: "alpha-web", name: "Alpha Web", path: "/work/alpha/web" });
  const sit = project({ id: "sit", name: "Síť", path: "/work/sit" });
  const projects = [alpha, alphaWeb, sit];

  it("returns null when nothing matches", () => {
    expect(matchProject(projects, { text: "do something generic" })).toBeNull();
    expect(matchProject(projects, {})).toBeNull();
  });

  it("matches by file path under a project's path", () => {
    expect(matchProject(projects, { paths: ["/work/alpha/src/index.ts"] })?.id).toBe("alpha");
  });

  it("path prefix beats a text name match", () => {
    // text mentions "sit" but the path lives under alpha → path wins
    expect(matchProject(projects, { text: "sit", paths: ["/work/alpha/x"] })?.id).toBe("alpha");
  });

  it("longest path prefix wins (nested project)", () => {
    expect(matchProject(projects, { paths: ["/work/alpha/web/page.tsx"] })?.id).toBe("alpha-web");
  });

  it("matches a project name as a whole word in text", () => {
    expect(matchProject(projects, { text: "please look at Alpha today" })?.id).toBe("alpha");
  });

  it("does not match a substring (web must not match webapp)", () => {
    const webapp = project({ id: "web", name: "web", path: "/x/web" });
    expect(matchProject([webapp], { text: "deploy the webapp now" })).toBeNull();
  });

  it("longest name wins on a tie", () => {
    // "alpha web" text contains both "alpha" and "alpha web"
    expect(matchProject(projects, { text: "ship the Alpha Web build" })?.id).toBe("alpha-web");
  });

  it("is diacritics-insensitive on the name (Czech)", () => {
    expect(matchProject(projects, { text: "the sit engagement" })?.id).toBe("sit");
    expect(matchProject(projects, { text: "the Síť engagement" })?.id).toBe("sit");
  });

  it("matches the id too, not only the name", () => {
    expect(matchProject(projects, { text: "alpha-web needs a fix" })?.id).toBe("alpha-web");
  });

  it("treats an exact path equal to the project root as under it", () => {
    expect(matchProject(projects, { paths: ["/work/alpha"] })?.id).toBe("alpha");
  });

  it("does not match a sibling path that merely shares a prefix string", () => {
    expect(matchProject([alpha], { paths: ["/work/alpha-other/x"] })).toBeNull();
  });
});
