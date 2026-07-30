---
name: Content Piece
phases:
  - id: write
    type: agent
    agent: copywriter
    consumes: task.md
    produces: draft.md
    model: haiku
    thinking: low
  - id: seo
    type: agent
    agent: seo-specialist
    consumes: draft.md
    produces: seo.md
    model: haiku
    thinking: low
  - id: edit
    type: agent
    agent: content-quality-editor
    consumes: seo.md
    produces: final.md
    model: sonnet
    thinking: medium
    loop:
      to: write
      maxRetries: 2
      escalate: true
      then: park
desc: >-
  Rychlá linka pro jeden kus obsahu: napiš → SEO → redakce. Článek, blog post,
  landing copy, jeden příspěvek.
ownerSubsystem: herald
complexity: light
---

# Content Piece

Odlehčená verze `content-campaign` pro jeden kus obsahu — bez fáze průzkumu a
strategie. **Text → SEO → redakce.** Skilly `article-writing` a `seo` jsou referencí.

## Fáze

1. **write** — `task.md` → `draft.md`: napiš obsah dle zadání a brand voice.
2. **seo** — `draft.md` → `seo.md`: klíčová slova, nadpisy, meta, čitelnost.
3. **edit** — `seo.md` → `final.md`: redakce a fakt-check; slabý draft → smyčka na
   **write** (2×, eskalace), pak park.
