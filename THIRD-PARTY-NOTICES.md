# Third-Party Notices

Skills in `.claude/skills/` and `.claude/commands/` were copied from open-source
repositories. Original licenses and authors are listed below.

---

## vercel-labs/agent-skills

Source: https://github.com/vercel-labs/agent-skills

Skills copied:
- `.claude/skills/composition-patterns/`
- `.claude/skills/react-best-practices/`
- `.claude/skills/web-design-guidelines/`

No explicit LICENSE file in the repository. Used under implied open-source terms
consistent with the public repository and `metadata.json` `license: MIT` fields
present in individual skills.

---

## Jeffallan/claude-skills

Source: https://github.com/Jeffallan/claude-skills  
License: MIT — Copyright (c) 2025

Skill copied:
- `.claude/skills/api-designer/`

---

## anthropics/claude-plugins-official

Source: https://github.com/anthropics/claude-plugins-official

Files copied:
- `.claude/skills/frontend-design/SKILL.md`
- `.claude/commands/code-review.md`

Individual plugin licenses may differ; see source repository for details.

---

## affaan-m/ecc

Source: https://github.com/affaan-m/ecc  
License: MIT

28 skills were adapted into `apps/api/data/skills/` (frontmatter reformatted to
ZIBBY's `SkillSchema`; Markdown bodies preserved, each carrying a source link).
Skills: `deep-research`, `market-research`, `exa-search`, `iterative-retrieval`,
`research-ops`, `scientific-literature-review`, `brand-voice`, `content-engine`,
`seo`, `article-writing`, `crosspost`, `social-publisher`, `marketing-campaign`,
`lead-intelligence`, `investor-outreach`, `investor-materials`, `product-lens`,
`product-capability`, `tdd-workflow`, `verification-loop`, `security-review`,
`e2e-testing`, `codebase-onboarding`, `api-design`, `backend-patterns`,
`frontend-patterns`, `prompt-optimizer`, `plan-orchestrate`.

---

## worldflowai/everything-claude-code

Source: https://github.com/worldflowai/everything-claude-code  
License: MIT

Referenced as inspiration for ZIBBY's skill/pipeline structure. The marketing &
sales agents added under `apps/api/data/agents/` are original work informed by the
patterns in both this repo and `affaan-m/ecc`.
