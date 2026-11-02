---
title: AI providers over API — future feature
department: dev
type: idea
tags:
  - roadmap
  - ai-providers
  - models
updated: "2026-11-02"
---

**Status:** idea, not scheduled. Operator decision 2026-11-02: write it down, don't build it yet.

## What

Today ZIBBY runs Claude by spawning local `claude -p` processes on the operator's
subscription. The future direction: call model APIs directly (Anthropic, OpenAI, later
others) instead of spawning local processes.

## Why

- **Higher limits.** API rate limits instead of the subscription's usage windows.
- **Model mixing.** Combine models from different providers in one task for better
  reasoning, for example one drafts and another critiques, or an advisor/executor pair.
- **Per-unit model choice.** In a workflow phase, in chat and elsewhere, pick a concrete
  model from every connected provider.

## What exists already (2026-11-02)

- Settings → **AI models** page (`/system/settings/ai-models`) with one section, **OpenAI**.
  It holds an API key in `.zibby/data/ai-providers/openai.json`, which is gitignored.
  Workflow stages receive it as `OPENAI_API_KEY`.
- First consumer: the coloring-book workflows generate their images through the OpenAI
  Images API (`PF_IMAGE_PROVIDER=openai`).

## Open points for when it gets built

- Add an Anthropic section with an API key next to OpenAI, plus any later providers.
- Build a model picker over all connected providers: a workflow phase `model:`, chat, and
  agent configs.
- Decide routing: API versus local `claude -p`, and the fallback when a key is missing.
- Budget and cost tracking per provider, because the API bills per token.

[[department-dev-moc]] · [[zibby-index]]
