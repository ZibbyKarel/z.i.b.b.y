# TODO 37 — Wire the Cloudflare security-audit skill into a workflow

> Zapojit nainstalovaný Cloudflare skill security-audit do workflow (agent krok s /security-audit) a ověřit běh end-to-end

## Scope

- The external skill `security-audit` (cloudflare/security-audit-skill) is installed in
  `.zibby/data/skills-external/security-audit/` and recorded in `.zibby/data/external-skills.json`.
- Workflow phases already support `skill: <id>` (the skill body rides the stage task as
  `## Skill /<name>` and the skill folder is granted via `--add-dir`).
- Wire the skill into the existing `security-audit` workflow's `audit` phase and prove with
  a fake-claude e2e that the stage dispatches the agent with `/security-audit` in its task.

## Rulings

- Existing `security-audit` workflow, `audit` phase — not a new workflow. Smallest change;
  the workflow already exists for exactly this purpose and its first phase is the hunt.
- Only the `audit` phase carries the skill; the later phases (exploit/validate/compliance/
  remediation) keep their own agents unchanged.
- The phase prompt puts the skill in full audit mode with its output directory in the run
  folder (`$ZIBBY_RUN_DIR/security-audit/`, outside the target repo) and asks for the
  REPORT.md content summarised into `audit.md`, so the handoff chain is unchanged.
- No real model in tests: the e2e uses `test/fixtures/fake-claude.mjs`.
