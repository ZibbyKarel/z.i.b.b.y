# TODO 34 — read_team_kb_note accepts the path search_team_kb cites — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A note found by `search_team_kb` is always readable by `read_team_kb_note` using exactly what the search hit showed.

**Architecture:** `KbReaderService.read()` today matches only the basename id (`n.id === noteId`). `search_team_kb` cites hits by repo-relative `path` only (`formatHit` never prints `noteId`), so the model passes `wiki/projects/partnersky-portal.md` and `read()` misses. Fix: `read()` also matches the walked entry's repo-relative path (with or without `.md`), comparing NFC-normalized strings; tool descriptions say "path as cited". No new path resolution on disk — still a match against walk-validated entries only.

**Tech Stack:** NestJS, TypeScript, vitest (api project), `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/todo-34.md`

## Root cause (systematic-debugging, verified)

Reproduced against the real devrel KB (`/Users/zibar/Workspace/devrel-knowledgebase`): `search("partnerský portál")` returns `{ noteId: "partnersky-portal", path: "wiki/projects/partnersky-portal.md" }`; `read("wiki/projects/partnersky-portal.md")` → null, `read("projects/partnersky-portal.md")` → null, `read("partnersky-portal")` → note. Ruled out: team root resolution (search uses the same `rootsFor` roots and hits), Unicode NFC/NFD (every filename in that KB is ASCII; "partnerský-portál" in the TODO is the note's _title_, not its filename). NFC normalization is still added as cheap hardening, because macOS filenames written by some tools are NFD while model-typed strings are NFC.

## Global Constraints

- Matching stays against walked entries only — never `path.resolve` a caller string (traversal/symlink guards depend on it).
- `.vtt` entries are still never returned by `read()`.
- Basename-id lookup keeps working (existing callers/tests).
- Commit with `PATH="$PWD/node_modules/.bin:$PATH" git commit` and the session trailer.

## Review Focus

- Path with `.md` exactly as cited → note (regression test).
- Path without `.md` (`wiki/notes/partner-portal`) → note.
- NFD filename on disk read via an NFC-typed path → note.
- Two notes with the same basename in different folders: a full path picks the right one (path match wins over id match).
- `../outside.md` / `../outside` still null (existing test, keep green).

---

### Task 1: `read()` resolves a cited path; tool descriptions say so

**Files:**

- Modify: `apps/api/src/kb/kb-reader.service.ts` (`read()`, ~L264-271)
- Modify: `apps/api/src/kb/kb-mcp.controller.ts` (`read_team_kb_note` description + `noteId` describe, ~L303-307)
- Modify: `docs/api/teams.md` (`noteId` bullet ~L193; `read_team_kb_note` bullet ~L306)
- Test: `apps/api/src/kb/kb-reader.service.test.ts`

**Interfaces:**

- Produces: `read(source: KnowledgeBaseSource, noteRef: string): Promise<KbNote | null>` — signature unchanged; `noteRef` may be a basename id, a repo-relative path, or that path without `.md`.

- [ ] **Step 1: Write the failing tests** in the `KbReaderService` describe:

```ts
it("reads a note by the exact path a search hit cites (search-hit → read-hit)", async () => {
  const hits = await reader.search(source, "partner portal");
  const cited = hits[0]?.path ?? "";
  expect(cited).toBe("wiki/notes/partner-portal.md");
  const note = await reader.read(source, cited);
  expect(note?.path).toBe(cited);
  expect(note?.title).toBe("Partner Portal");
  expect((await reader.read(source, "wiki/notes/partner-portal"))?.path).toBe(cited);
  expect((await reader.read(source, "partner-portal"))?.path).toBe(cited);
});

it("matches a non-ASCII path regardless of NFC/NFD normalization", async () => {
  const name = "partnerský-portál";
  await fs.writeFile(
    path.join(root, "wiki", "notes", `${name.normalize("NFD")}.md`),
    "---\ntitle: Partnerský portál\n---\nBody.\n",
    "utf8",
  );
  expect((await reader.read(source, `wiki/notes/${name.normalize("NFC")}.md`))?.title).toBe(
    "Partnerský portál",
  );
  expect((await reader.read(source, name.normalize("NFC")))?.title).toBe("Partnerský portál");
});

it("a full path disambiguates two notes sharing a basename", async () => {
  await fs.mkdir(path.join(root, "wiki", "projects"), { recursive: true });
  await fs.writeFile(
    path.join(root, "wiki", "projects", "partner-portal.md"),
    "---\ntitle: Project Partner Portal\n---\nx\n",
    "utf8",
  );
  expect((await reader.read(source, "wiki/projects/partner-portal.md"))?.title).toBe(
    "Project Partner Portal",
  );
  expect((await reader.read(source, "wiki/notes/partner-portal.md"))?.title).toBe("Partner Portal");
});
```

- [ ] **Step 2: Run, expect the first and third to FAIL** (null): `cd apps/api && pnpm exec vitest run src/kb/kb-reader.service.test.ts`

- [ ] **Step 3: Implement.** In `read()`: `const ref = noteRef.normalize("NFC")`; among non-vtt notes, first find one whose `relPath.normalize("NFC")` equals `ref` or equals `ref + ".md"`; else fall back to `n.id.normalize("NFC") === ref`. Update the method's doc comment. In the controller, `read_team_kb_note` description: "Read one full note … by the note path exactly as cited in a search_team_kb hit (e.g. wiki/notes/foo.md); a bare note id (filename without extension) also works." and `noteId` describe likewise. Update the two `docs/api/teams.md` bullets.

- [ ] **Step 4: Run the reader + controller tests, expect PASS:** `pnpm exec vitest run src/kb/kb-reader.service.test.ts src/kb/kb-mcp.controller.test.ts`

- [ ] **Step 5: prettier + eslint on changed files; commit** `fix(kb): read_team_kb_note accepts the path search_team_kb cites`.
