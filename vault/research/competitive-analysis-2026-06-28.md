# ZIBBY Competitive Intelligence — 2026-06-28

## Executive Summary

ZIBBY occupies a structurally unique position in the emerging personal-agentic-OS category: it is the only tool that combines a hardcoded, tiered gate/approval engine with a file-native second brain (Obsidian vault, index-first markdown, no vector DB), multi-tenant project governance, and a full software-delivery pipeline (Architekt → Kodér → Code-Review → Tester → Dokumentátor) under a single self-hosted operator identity. Its biggest structural strength is that the approval floor is wired into the system and cannot be overridden by inbound content — a property none of the compared tools fully share. Its biggest gaps are autonomous browser and desktop control (none implemented), a plugin/MCP marketplace (absent), a mobile client (absent), and proactive channel-watching of email/Slack with structured triage (planned but not live). The tools most architecturally similar to ZIBBY's end-state are Devin (full autonomous engineer with planning checkpoints), Lindy AI (trigger-driven autonomous workflow with per-step approval controls), and Cursor's background-agents model — but all three sacrifice either self-hosting, file-as-truth memory, or the structural gate.

---

## Tool Profiles

### 1. Cursor

Cursor is a full VS Code-fork IDE with deep codebase indexing, multi-file Composer, Chat, Tab autocomplete, and — as of 2025-2026 — first-class Background Agents. Background Agents clone the repository into a cloud Ubuntu sandbox, work autonomously for arbitrarily long sessions, and open a pull request when done. The Auto-review system (shipped in Cursor 3.6, default for new users) uses a context-aware classifier agent that can call `ReadFile` and `ListDir` before deciding whether to pause or proceed; it is the closest existing analogue to ZIBBY's tiered gate, but operates within the IDE session rather than as a system-floor policy.

Key features:
- Background Agents run cloud-isolated tasks and surface PRs (effectively Tier-2/3 equivalent)
- Auto-review classifies each action and can require approval for sensitive file or terminal operations by default; MCP tool calls each require individual approval
- Credit-based pricing: Hobby (free), Pro ($20/mo), Pro+ ($60/mo), Ultra ($200/mo), Teams ($40/user/mo)
- No self-hosted deployment; no file-native memory; no voice I/O; no email/Slack channel watching
- Context window management through codebase indexing and repo map (not full-repo injection)
- Acquired Continue.dev in June 2026 (acqui-hire; repo now read-only at v2.0.0 under Apache 2.0)
- Open-source: No (proprietary). Relevant for ZIBBY: Auto-review classifier design pattern is the most directly translatable gate concept

Unique differentiators vs ZIBBY: Native IDE integration with no context-switching; background agent cloud sandbox with automatic PR; MCP marketplace integration with per-call approval; Auto-review contextual classifier (more granular than binary approve/deny).

Approval/safety model: Default approval required for terminal commands, sensitive-data reads, config file edits, and all MCP tool calls. Auto-review can escalate or pass autonomously. The gate is a feature, not a structural floor — an agent config can potentially weaken it.

---

### 2. Cline (formerly Claude Dev)

Cline is a VS Code sidebar autonomous coding agent (MIT-licensed, open source) with 8M+ developers using it as of 2026. It has expanded to JetBrains, Cursor, Windsurf, Zed, Neovim, and a preview CLI. Cline's core model is human-in-the-loop by default: every file edit, terminal command, and browser action requires explicit approval before execution. An auto-approve toggle exists to let it run fully autonomously. Plan mode is a non-destructive reasoning phase before any code is touched — architecturally similar to ZIBBY's Tier-1 silent analysis phase.

Key features:
- Plan/Act dual-mode: Plan is read-only and interruptible; Act executes with per-step human approval
- Browser control via Puppeteer (real browser, not headless simulation) for UI verification
- MCP Marketplace with hundreds of servers (browser-use, Playwright, web-search, databases, etc.); MIT licensed; per-call approval for each MCP tool
- 30+ LLM provider support: Anthropic, OpenAI, Gemini, Bedrock, Ollama, LM Studio, OpenRouter, etc.
- Full local operation possible with Ollama — no data leaves the machine
- No persistent cross-session memory; no voice I/O; no email/Slack monitoring; no file-native second brain
- Every action logged locally for complete reproducibility audit trail
- Pricing: Free and open source; costs only what the underlying LLM provider charges (BYOK)

Unique differentiators vs ZIBBY: MCP Marketplace (hundreds of community servers installable in one click); Puppeteer-driven browser for UI verification during coding; runs in the editor with zero context-switch; true open-source with MIT license for forking.

Approval/safety model: Human-in-the-loop is the default. Every proposed file diff and terminal command is shown with diff view before execution. Auto-approve is an explicit user toggle, not the default. Gate is behavioral, not structural.

Memory/context: No persistent memory across sessions. Context is scoped to the current VS Code workspace.

---

### 3. Continue.dev (now archived, acquired by Cursor June 2026)

Continue.dev was an open-source AI coding assistant (Apache 2.0) supporting VS Code, JetBrains, Neovim, and a CLI. It functioned as model-agnostic middleware, supporting 20+ providers including full local Ollama operation. Its three interaction modes — Chat, Plan, Agent — closely parallel ZIBBY's own directed/autonomous distinction. It used MCP (Model Context Protocol) to connect to external data sources, git commands, databases, and persistent memory.

Key features (as of final v2.0.0, June 2026 — repo now read-only):
- Chat, Plan, Agent modes; tab autocomplete; inline chat; contextual code retrieval
- Model-agnostic: OpenAI, Anthropic, Google, Ollama, LM Studio, DeepSeek, Mistral, Grok, Groq, Fireworks
- MCP-first architecture for external tool integration
- Async PR agents: run on every PR to enforce rules defined in code
- No persistent second brain; no voice; no email/Slack monitoring
- Apache 2.0 license — fully forkable; codebase handed to community post-acquisition
- Pricing: Free and open-source (BYOK only)

Relevance for ZIBBY: The async PR agent pattern (checking rules on every PR open/update) is a direct integration target for ZIBBY's Code-Review step. The MCP-first approach maps cleanly to ZIBBY's ts-rest contract layer. As an Apache 2.0 archived codebase, the async PR agent logic is directly forkable.

Approval/safety model: No formal gate. Human-in-the-loop via editor UI; no structural floor.

---

### 4. Open Interpreter

Open Interpreter is an open-source (MIT) terminal agent that writes, executes, and iterates on code in any language on the operator's local machine. It has full access to the file system, network, and installed tools. A 2025 desktop app reframes it as a general-purpose computer agent with document editing (Word, Excel, PDF). The tool is honest in its own documentation that giving an LLM shell access is a security risk and recommends container isolation.

Key features:
- Local code execution with real-time iteration: write → run → read stderr → fix → repeat
- Browser control via agent-browser (web apps) and trycua (native app testing)
- Desktop app with document editing (Word, Excel, PDF) added 2025
- Confirmation prompt before each code block execution by default
- Supports any OpenAI-compatible LLM; Ollama local model support
- 60,000+ GitHub stars; MIT licensed; fully self-hosted
- No persistent memory across sessions; no second brain; no voice (base product); no email/Slack
- Pricing: Free and open-source (BYOK); cloud-hosted option available

Unique differentiators vs ZIBBY: Fully general local code execution (Python, JS, shell, any language) without any pre-defined agent structure; document editing (Office files, PDF) built into the UI; zero config self-hosted.

Approval/safety model: Confirmation prompt before each code block. No tiered system. Sandbox (Docker/container) recommended but not enforced. The safety documentation explicitly warns operators about the risk of shell access on bare metal.

Conflicts with ZIBBY principles: The "any LLM shell access" model is the opposite of ZIBBY's structural gate. Integration would require wrapping every execution action through ZIBBY's gate.

---

### 5. Aider

Aider is a git-native, model-agnostic terminal coding agent (Apache 2.0, ~45,900 GitHub stars, actively maintained). It is the most battle-tested open-source tool for multi-file git-committed edits from the terminal. 70%+ of Aider's own codebase is now written by Aider itself, serving as a live self-hosting proof of concept.

Key features:
- Git-first: all edits committed automatically with descriptive commit messages; `/diff`, `/undo`, `/commit`, `/git` in-chat commands
- Repository map: maintains an AST-aware map of the codebase to avoid dumping every file into context
- Watch mode (2026): detects AI comment markers in files edited in any external editor, makes the change, commits it, clears the marker — background pair-programmer without switching windows
- Architect mode for high-level planning before execution
- 100+ language support
- Voice input support (built-in STT)
- Supports any OpenAI-compatible API including Ollama local models (`aider --model ollama/qwen3-coder`)
- Automatic lint/test execution after each change; fixes flagged issues
- Latest stable: v0.86.2 (February 2026)
- Pricing: Free and open-source (Apache 2.0); BYOK only

Unique differentiators vs ZIBBY: Git-native commit loop (every edit is a versioned, undoable commit); watch-mode background edits; repo map (AST-aware context selection rather than full-file injection); built-in voice STT input. The most mature self-contained autonomous git editor available.

Approval/safety model: No formal gate. Aider shows planned changes and asks for confirmation. `/undo` reverts the last commit. No tiered system — it is the operator's responsibility to review commits.

Memory/context: Repo map persists across the session; no cross-session memory.

---

### 6. Claude Computer Use / Anthropic Computer Use API

Anthropic's Computer Use API (public beta since October 2024) gives Claude models the ability to take screenshots, move the mouse, click, type, scroll, and interact with any desktop application or web browser in a loop: observe screen state → decide action → execute action → screenshot → repeat. As of April 2026, the current beta header is `computer-use-2025-11-24` supporting Claude Opus 4.8/4.7/4.6, Sonnet 4.6, and Opus 4.5.

Key features:
- Three pre-defined beta tools: `computer_20251124` (screen/mouse/keyboard), `bash_20250124`, `text_editor_20250124`
- Action types: `screenshot`, `left_click`, `right_click`, `double_click`, `type`, `key`, `scroll`, `drag`, `zoom` (with `enable_zoom: true`)
- Vision-driven (not DOM-driven): works with any UI including legacy desktop apps and thick-client software
- Zoom action allows high-resolution inspection of a screen region for fine-grained UI interaction
- Prompt injection risk: Anthropic ships classifiers to detect when Computer Use is active and flag harmful actions; Sonnet 4.6 has improved injection resistance
- Intended to run in a controlled sandbox (Docker container, VM) — Anthropic explicitly recommends this
- No persistent memory; no voice; purely an API capability consumed by the operator's application
- Pricing: Token-based through the Anthropic API; no separate Computer Use fee; models charge per-token at standard rates

Unique differentiators vs ZIBBY: This is the foundational capability ZIBBY lacks entirely. Any UI automation — including existing web dashboards, desktop tools, and legacy apps — becomes automatable without custom integrations.

Approval/safety model: No built-in gate in the API itself. Anthropic recommends operator-side sandboxing. The operator's application must implement any approval mechanism — which is exactly where ZIBBY's gate system would apply.

**Note: This is the most strategically important item for ZIBBY's computer-use implementation path.**

---

### 7. Multion (rebranded AGI-0)

Multion repositioned in 2026 from a browser agent API to AGI-0, a mobile-first personal automation app. The core capability is a Motor Cortex layer: parallel AI agents that navigate real web pages using vision + reasoning, complete tasks across multiple websites simultaneously, and remember operator preferences across sessions. The web scraping and parallel-agent capability is production-grade.

Key features:
- Best-in-class full-page structured LLM data scraping; parallel agent execution (multiple tabs/sites simultaneously)
- Vision-capable: adapts when websites change layout, understanding intent not just selectors
- Memory stack: remembers preferences from prior sessions, reducing re-explanation overhead for recurring tasks
- Mobile app (AGI-0): native mobile browser control + accessibility API app switching on-device
- Concurrent task execution as a core differentiator
- API for developers: build autonomous web agents programmatically via the Multion API
- Pricing: Free tier (50 action points/month); Pro tier (unlimited action points, priority processing, advanced memory)
- No self-hosted option; no file-native second brain; no voice I/O; SaaS-only

Unique differentiators vs ZIBBY: Parallel multi-tab web agent execution at scale; mobile-native computer use; cross-session preference memory (without a file-based vault); production-grade web scraping with vision adaptation.

Approval/safety model: No explicit gate or tier system. Actions execute autonomously once triggered. Mobile app has per-task initiation but no mid-task approval checkpoints.

---

### 8. HyperWrite Agent

HyperWrite's AI Agent is a Chrome extension that automates browser tasks: search, form-fill, navigation, booking, email management, and research compilation. It is the most consumer-friendly of the browser agents — oriented toward daily personal tasks rather than developer workflows. The underlying infrastructure (Hyperbrowser/HyperAgent) is available as an open-source TypeScript framework for building browser automation.

Key features:
- Chrome extension-based: runs in your actual browser session without separate sandboxing
- Natural-language task dispatch: "Find the top three marketing articles this week and summarize them"
- Handles: email, calendar, booking, research, form-filling, web app interaction
- HyperAgent (open-source, GitHub: hyperbrowserai/HyperAgent) for developer automation
- Uses accessibility snapshots + screenshot for UI understanding
- Pricing: Premium $19.99/month, Ultra $44.99/month (trial available)
- No self-hosted option; no file-native memory; no voice; no git/code integration

Unique differentiators vs ZIBBY: Extension runs inside the user's existing authenticated browser session (logged-in cookies, saved passwords) — no authentication handoff problem; consumer-friendly natural-language interface for non-technical tasks.

Approval/safety model: Task-level initiation only. No mid-task gate. Browser extension runs with the user's full session permissions.

---

### 9. Rabbit R1 / rabbitOS

Rabbit R1 is a dedicated AI hardware device built around the Large Action Model (LAM) concept: an AI that learns to operate websites and services by observing human demonstrations rather than requiring API integration. The 2025 rabbitOS 2 update introduced card-based UI, gesture navigation, and a "creations" feature for generating on-device mini-apps. The 2026 DLAM (Distributed Large Action Model) and OpenClaw integration enables the R1 to see the operator's computer screen via screen-sharing and control it remotely.

Key features:
- Voice-first hardware interface (always-on push-to-talk)
- LAM: learns service UIs by human demonstration, no API required
- DLAM + OpenClaw (2026 alpha): R1 sees your computer screen and operates it remotely
- rabbitOS 2: card-based interface, gesture navigation, mini-app generation
- "Cyberdeck" hardware variant in development: aimed at CLI/vibe-coding users with a mechanical keyboard and large screen, designed to run Claude Code CLI and the upcoming rabbit CLI
- No self-hosted deployment; proprietary hardware required; cloud-dependent
- Pricing: R1 hardware $199 one-time; subscription model for services

Unique differentiators vs ZIBBY: The voice-first hardware form factor; LAM as demonstration-learned computer use (no code required to teach it a new service); the cyberdeck concept as a dedicated single-operator AI workstation.

Approval/safety model: No formal gate. Voice confirmation before major actions in practice; no structural tier system.

---

### 10. Replit Agent (Agent 3)

Replit Agent 3 (launched September 2025) is a cloud-native autonomous development agent that works inside Replit's online IDE. It operates for up to 200 continuous minutes, self-tests in a real browser using a proprietary testing system (3x faster and 10x more cost-effective than Computer Use models for UI testing), and can spawn child agents with integrations to Slack, email, and Telegram. It runs on Claude Opus 4.7 / Gemini 3.1 Pro with per-task model routing.

Key features:
- 200-minute autonomous session; full cloud environment access (filesystem, terminal, package manager, DB, deployment pipeline)
- Browser self-testing: clicks through the built app, identifies failures, auto-fixes and re-runs
- Agent spawning: describe a workflow → Agent 3 generates a specialized sub-agent with 160+ third-party integrations (via OpenInt acquisition)
- Autonomy level control: task-list-only mode through fully autonomous planning
- Multi-agent orchestration within Replit's managed cloud
- Security scanning: pre-publish malicious file detection and supply chain attack blocking
- Typical CRUD app: working deployment in 10-15 minutes from a clear prompt
- No self-hosted deployment; Replit cloud only; no file-native memory vault; no voice
- Pricing: Free tier available; Core/Pro plans with agent minutes as the metered unit

Unique differentiators vs ZIBBY: Integrated deployment pipeline (agent writes code, tests it in a real browser, deploys to production — all in one loop); agent spawning with 160+ managed integrations; the fastest prototype-to-deployed-URL path of any tool surveyed.

Approval/safety model: Autonomy level is configurable. No explicit checkpoint gate for code changes; human reviews the output after completion. PRs are the human-review surface. Supply chain scanning runs pre-deploy.

---

### 11. Devin (Cognition AI)

Devin is positioned as the world's first autonomous AI software engineer. It operates entirely in its own sandboxed environment (shell, editor, browser) and is explicitly designed for human-in-the-loop governance with two mandatory checkpoints: an interactive planning checkpoint (operator confirms or modifies the plan) and a PR checkpoint (PR is the gate for any code entering the main branch). Devin 2.0 (April 2025) reduced the entry price from $500/month to $20/month while delivering 83% more junior-level task completion per ACU.

Key features:
- Interactive Planning: detailed execution plan presented and confirmed before work begins
- Full sandbox: shell + code editor + browser; Devin searches the web, reads docs, runs tests
- Devin Search: natural-language codebase search ("Where is the auth logic?")
- Devin Wiki: auto-generated and auto-updated architecture documentation from the codebase
- Multi-agent: spin up parallel Devin instances for concurrent task execution
- Audit trail for compliance: every action logged and attributable
- Enterprise: VPC deployment option, SAML/OIDC SSO, centralized admin
- Cognition valuation: $10.2B (September 2025), in talks for further raise at $25B (April 2026)
- Goldman Sachs pilot: 12,000 developers + Devin, targeting 20% efficiency gains
- Pricing: Core $20/month (pay-as-you-go at $2.25/ACU); Team $500/month (250 ACUs at $2.00/ACU); Enterprise custom

Unique differentiators vs ZIBBY: Auto-generated and auto-maintained codebase wiki (Devin Wiki); parallel multi-instance execution; enterprise VPC deployment; the two-checkpoint model (plan + PR) is the most polished human-in-loop governance of any tool surveyed; natural-language codebase search across the full repo.

Approval/safety model: Two mandatory, non-negotiable checkpoints: planning confirmation and PR review. The gate is a product design principle but enforced by workflow convention, not a structural runtime policy — a sufficiently configured enterprise deployment could theoretically bypass it.

---

### 12. SWE-agent (Princeton)

SWE-agent is an open-source research framework (MIT licensed, ~19,100 GitHub stars, NeurIPS 2024) that turns language models into autonomous software engineering agents via the Agent-Computer Interface (ACI). The ACI is the central innovation: instead of raw bash, the model gets structured tools — file navigation, targeted edit commands, and a running context manager — that produce 2x higher SWE-bench scores with identical models. SWE-agent 2.0 expanded into cybersecurity (EnIGMA mode for CTF challenges) and released mini-SWE-agent (single-bash-tool, 74%+ SWE-bench Verified with 100x less code).

Key features:
- ACI: structured file navigation, targeted edits, context manager rather than raw bash
- Autonomous GitHub issue resolution (SWE-bench benchmark origin)
- EnIGMA mode: cybersecurity CTF challenge mode with interactive tools and long-output summarizer
- mini-SWE-agent: 74%+ SWE-bench Verified with single bash tool + ReAct loop (100x less code than full agent)
- Open SWE (LangChain): productized fork with cloud sandboxes, Slack/Linear invocation, subagent orchestration, automatic PR creation — directly customizable
- MIT licensed, forkable, no vendor lock-in
- Runs with any LM choice (Claude, GPT, Gemini, Ollama)
- No persistent second brain; no voice; no email/Slack monitoring; pure research/infrastructure tool
- Pricing: Free and open-source (BYOK for LM costs)

Unique differentiators vs ZIBBY: ACI design pattern (the single most-imitated innovation in autonomous coding agents); mini-SWE-agent for lightweight deployable coding agent; Open SWE as a ready-to-fork production coding agent with Slack/Linear triggers. The ACI could directly inform ZIBBY's Kodér agent's tool interface design.

Approval/safety model: Non-interactive autonomous mode is the default. No gate system. Designed for research benchmark runs, not production human-in-loop workflows.

---

### 13. Mem.ai

Mem is an AI-native personal knowledge management system that treats organization as an AI problem, not a user problem. All captures go into a single inbox-style stream; Mem's AI tags, links, and surfaces notes by context. Mem 2.0 (October 2025) added offline support, voice capture mode, and a more agentic AI layer that acts on notes rather than only organizing them. The system integrates email, calendar, and Slack to capture "the exhaust of your professional life."

Key features:
- Single inbox stream: no manual folder/tag structure; AI does all organization
- Mem Chat: converse with your full knowledge base
- Contextual suggestions: "Related Mems" sidebar surfaces forgotten knowledge automatically
- Integrations: email, calendar, Slack — automatic capture from work exhaust
- Voice capture mode (Mem 2.0, 2025)
- Agentic layer (Mem 2.0): acts on notes, not only organizes them
- Offline support (Mem 2.0)
- No self-hosted option; SaaS-only; proprietary AI models
- Pricing: Free tier; Mem X Pro $20-40/month
- Memory architecture: proprietary vector+graph hybrid (**conflicts with ZIBBY's index-first principle**)

Unique differentiators vs ZIBBY: Zero-maintenance organization (AI tags, links, surfaces automatically — no MOC upkeep); automatic capture from communication channels without operator action; the richest "second brain as a service" UI of any tool surveyed.

**Conflicts with ZIBBY principles:** Proprietary cloud storage; vector-based retrieval (not index-first); no file export to Obsidian; no operator-owned plaintext vault. The philosophy is the opposite of ZIBBY's "files are source of truth."

---

### 14. Notion AI

Notion AI (as of Notion 3.x, 2025-2026) is an embedded multi-agent system within Notion workspaces. Notion 3.0 (September 2025) added autonomous AI Agents that execute multi-step workflows triggered by schedules, Slack messages, emails, calendar events, and database changes. Notion 3.3 (February 2026) added Custom Agents for team-built specialized workflows. The AI can access GPT-5, Claude Opus 4.1, and o3 models and search across the connected tech stack: Google Drive, GitHub, Slack, Jira, Salesforce, OneDrive, Box.

Key features:
- Custom Agents: autonomous, trigger-based (schedule, Slack, email, calendar, DB change), work in background without user input
- Database Agents: process 3,000+ records, auto-fill properties using workspace context + web
- AI search across Google Drive, GitHub, Slack, Jira, Salesforce with cited sources
- Multiple model support: GPT-5, Claude Opus 4.1, o3 (user-selectable per task)
- Agent developer platform (May 2026): connect external agents, pull from any database
- Audit trail: every agent run logged; changes visible and reversible; permission-scoped
- Not self-hosted; SaaS multi-user; no voice; no code execution/git integration
- Pricing: Business ($20/user/month, AI included); Enterprise (custom); Custom Agent credits $10/1,000 credits (from May 4 2026)

Unique differentiators vs ZIBBY: Richest trigger variety of any tool (schedule + Slack + email + calendar + DB change in one system); cross-stack search with citations; database agents at 3,000+ record scale; the most mature no-code custom-agent builder surveyed.

**Conflicts with ZIBBY principles:** Proprietary document format; multi-user SaaS; no self-hosted path; not plaintext/markdown.

---

### 15. Lindy AI

Lindy is a no-code AI workflow automation platform where each agent ("Lindy") is described in plain English, configured with trigger and action blocks, and connected to 1,000+ integrations including Gmail, Slack, HubSpot, Salesforce, Calendar, Notion. Lindies can coordinate with each other (multi-Lindy) for multi-step tasks. The platform's distinctive feature is optional per-step human approval within any workflow — you can require Lindy to ask before sending any email or updating any CRM record.

Key features:
- Plain-English agent definition with visual trigger/action canvas
- Per-step human approval: optional gate on any action (send email, update record, etc.)
- Multi-Lindy coordination: agents hand off tasks to specialized peer agents
- 1,000+ integrations; 234 confirmed business app connectors
- Email triage, meeting scheduling, CRM update, lead research, customer support — all autonomous by default, gateable by configuration
- Multi-LLM: Claude Sonnet 4.5 (default), GPT-5, Gemini Flash 2.0, Claude Haiku 3.5
- SOC 2 Type II, HIPAA, RBAC, MFA — enterprise compliance
- No self-hosted option; SaaS only; no code execution/git; no file-native memory
- Pricing: Free tier; Plus $49.99/month (unlimited agents, full integration library, multi-Lindy)

Unique differentiators vs ZIBBY: The most mature per-step approval model in a no-code agent platform; multi-agent hand-off between Lindies; widest integration catalog of any surveyed tool (1,000+); SOC 2/HIPAA compliance out of box; natural-language agent definition without code.

**Conflicts with ZIBBY principles:** SaaS-only; no file-as-truth memory; cloud-hosted agent state. The per-step approval concept is directly translatable to ZIBBY's gate system design.

---

### 16. Relevance AI

Relevance AI is an enterprise-grade no-code AI workforce platform — not a single agent, but a platform for building, deploying, and coordinating teams of agents. It targets sales, marketing, operations, and support use cases. The dual-meter pricing model (Actions + Vendor Credits) separates platform usage from LLM compute. BYOK is supported for OpenAI, Azure OpenAI, AWS Bedrock (Claude), Google Cloud Vertex (Claude/Gemini), and Google AI Studio.

Key features:
- Workforce model: deploy teams of specialized agents for end-to-end process automation
- No-code "Invent" builder: describe an agent in plain English; generates tools, skills, and prompt chains
- 1,000+ native integrations; custom triggers via webhooks, cron, CRM events
- BYOK for all major LLM providers; model-agnostic
- Enterprise governance: built-in evaluations, agent audit trail, governance controls, unlimited agents/tools/workforces on all tiers
- Not self-hosted; SaaS enterprise platform; no file-native memory; no voice; no git/code integration
- Pricing: Free tier; Pro; Team ($234-$349/month); Enterprise (custom). Top-ups: $40/1,000 Actions, $20/10,000 Vendor Credits

Unique differentiators vs ZIBBY: The most mature multi-agent workforce orchestration of any no-code platform surveyed; BYOK across all major cloud LLM providers; enterprise governance and evaluation built-in; scales from single agent to full org-wide workforce.

**Conflicts with ZIBBY principles:** SaaS-only; no file-as-truth; no self-hosted path; multi-user enterprise focus (not single-operator). The workforce coordination model is the closest external reference point for ZIBBY's 150-agent multi-specialist architecture, but ZIBBY's is self-hosted and file-native.

---

## Feature Gap Matrix

| Feature | Tools That Have It | ZIBBY Status | Priority | Notes |
|---|---|---|---|---|
| Autonomous browser control | Cline (Puppeteer), Multion/AGI-0, HyperWrite, Open Interpreter, Replit Agent 3, Devin, Rabbit R1/DLAM | Not implemented | **H** | Highest-impact gap; browser-use MCP server is the fastest integration path |
| Desktop/GUI computer use | Open Interpreter (trycua), Rabbit R1/DLAM, Claude Computer Use API, Replit Agent 3 | Not implemented | **H** | Anthropic Computer Use API (`computer-use-2025-11-24`) is the natural fit given ZIBBY's Claude dependency |
| File system access | All coding agents (Cursor, Cline, Aider, Devin, SWE-agent, Open Interpreter) | Implemented ✓ | — | ZIBBY strength; unique in treating files as the primary persistence layer |
| Git-aware code editing | Aider, Cursor, Cline, Devin, SWE-agent, Continue.dev | Implemented ✓ | — | ZIBBY strength; Tier-3 gate before any merge is ahead of most tools |
| Terminal/REPL execution | Cline, Open Interpreter, Aider, Devin, Replit Agent 3, SWE-agent | Implemented ✓ | — | Present; gate wraps terminal actions |
| Voice I/O (STT + TTS) | Aider (STT only), Rabbit R1 (voice-first), Multion/AGI-0 (mobile voice) | Planned | **H** | Stack already defined (faster-whisper + Kokoro + Ollama); implementation is the gap |
| Memory persistence across sessions | Mem.ai, Notion AI, Multion/AGI-0, Lindy AI | Implemented ✓ | — | ZIBBY strongest unique feature; no competitor uses index-first markdown |
| Multi-modal input (images, screenshots) | Cursor, Cline, Devin, Claude Computer Use, Replit Agent 3 | Not implemented | M | Screenshot context needed for Computer Use loop; also useful for bug reports |
| Plugin/extension marketplace | Cline (MCP Marketplace, hundreds of servers), Cursor (MCP with per-call approval), Continue.dev | Not implemented | M | MCP protocol support would unlock hundreds of community tools; ts-rest wrapper needed |
| Multi-agent orchestration | Devin (parallel instances), Replit Agent 3 (child agents), Relevance AI (workforce), Lindy (multi-Lindy), Cursor (background agents) | Implemented ✓ | — | ZIBBY strength; architecture is more structured than most |
| Approval/gate system | Devin (plan + PR checkpoints), Cline (per-step human-in-loop), Lindy (per-step optional approval), Cursor (auto-review classifier) | Implemented ✓ | — | ZIBBY's most structurally unique feature; the gate is a runtime floor, not a config |
| Context window management | Cursor (codebase index + repo map), Aider (repo map), Continue.dev (MCP context), SWE-agent (ACI) | Partial | M | Aider/SWE-agent repo-map pattern would benefit Kodér agent's context selection |
| Proactive monitoring / autonomous watching | Lindy (email/Slack/calendar triggers), Notion AI (trigger-based custom agents), Multion/AGI-0 (recurring tasks), Replit Agent 3 (scheduled automations) | Planned | **H** | Highest autonomy-unlock feature; Lindy's trigger model is the reference design |
| Self-hosted deployment | Aider, Cline, Open Interpreter, SWE-agent, Continue.dev (pre-acquisition) | Implemented ✓ | — | ZIBBY strength; only non-SaaS multi-capability personal agent OS |
| Mobile client | Multion/AGI-0 (mobile-native), HyperWrite (Chrome extension), Rabbit R1 (hardware device) | Not implemented | L | Single-operator focus; low priority vs core agent capabilities |
| Collaboration / multi-user | Cursor (Teams plan), Devin (multi-instance), Relevance AI (workforce), Notion AI (workspace) | Out of scope | — | Out of scope by design; ZIBBY is single-operator |
| Cost/spend control | Cursor (credit caps), Devin (ACU budget), Relevance AI (action/credit dual meter), Lindy (task limits) | Partial | M | Token/cost budget per project or per autonomy tier would prevent runaway spend |
| CI/CD integration | Devin (GitHub PR → CI pipeline), Replit Agent 3 (deploy pipeline), SWE-agent / Open SWE (PR creation) | Partial | M | Connecting the PR gate to GitHub Actions / CI status check would close the loop |
| PR automation | Devin, Cursor Background Agents, Cline (semi-auto), Aider (git commit auto), SWE-agent / Open SWE | Implemented ✓ | — | ZIBBY strength; PR as gate is architecturally sound |
| Email/Slack integration | Lindy (read + draft + send), Notion AI Custom Agents (Slack trigger), Replit Agent 3 (Slack/email child agents), Multion/AGI-0 | Planned | **H** | Core to the Autonomous mode value proposition; Lindy is the reference implementation |

---

## Computer Use Landscape

### How Each Tool Handles Desktop/Browser Control

**Cline**: Uses Puppeteer (real browser, not headless by default) for UI verification during coding tasks. The agent launches a browser, navigates to the running app, interacts with UI elements, and reads the DOM or takes screenshots to confirm the feature works. Every browser action requires human approval before execution (unless auto-approve is toggled on). DOM-driven approach; cannot operate native desktop applications.

**Open Interpreter**: Uses `agent-browser` for web app control and `trycua` for native desktop and app testing. Runs on the operator's bare machine by default (no sandbox unless explicitly configured). Code is written and executed in the local Python/shell environment, then the agent observes stdout/stderr to iterate. The approach is maximally capable but maximally risky — the Anthropic Computer Use sandbox recommendation is directly applicable here.

**Rabbit R1 (DLAM + OpenClaw)**: The R1 device connects via screen-sharing to the operator's computer. DLAM (Distributed Large Action Model) sees the screen content and sends control signals back. This is a vision-driven remote-control approach — currently in alpha (2026). The interaction model is voice-initiated on the R1, executed remotely on the connected computer.

**Anthropic Claude Computer Use API**: The foundational vision-driven approach. The loop is: (1) application takes screenshot and sends to Claude with the `computer_20251124` tool available; (2) Claude returns JSON action (`left_click`, `type`, `scroll`, `key`, `screenshot`, `zoom`); (3) application executes action on the desktop/container; (4) screenshot is captured and returned to Claude; repeat. Three tool types: `computer_20251124` (mouse/keyboard/screen), `bash_20250124` (terminal), `text_editor_20250124` (file editing with undo). Intended to run inside an isolated sandbox (Docker recommended by Anthropic).

**Multion / AGI-0**: Vision + reasoning without DOM access. Uses its own proprietary model trained on web navigation. Adapts when website layouts change because it understands intent, not just CSS selectors. Mobile version uses accessibility APIs on Android/iOS for app switching and in-app actions. Parallel agent execution (many browser sessions simultaneously) is the key differentiator.

**Replit Agent 3**: A proprietary browser testing system described as "3x faster and 10x more cost-effective than Computer Use models." The agent launches the built application in a real browser, tests UI flows, reads results, and auto-fixes failures. Tightly integrated with Replit's cloud environment; likely a hybrid DOM + screenshot approach optimized for Replit's hosting environment.

**Devin**: Operates a sandboxed browser within its isolated environment. Devin can search the web, read documentation, and navigate to running services for testing. Browser control is tool-use within the Devin sandbox, not operator-desktop control. The cleanest model: Devin's browser is fully isolated from the operator's computer.

**HyperWrite / HyperAgent**: Chrome extension runs in the operator's existing authenticated browser session. This means existing bookmarks, cookies, and saved sessions are available to the agent — solving the authentication problem that headless browsers face. The open-source HyperAgent (TypeScript, GitHub: hyperbrowserai/HyperAgent) uses accessibility snapshots plus screenshots, compatible with non-vision models.

### APIs and Frameworks

| Approach | Primary Tool/API | Vision vs DOM |
|---|---|---|
| Anthropic Computer Use API | `computer-use-2025-11-24` beta header | Vision-driven |
| OpenAI Computer Use Agent | OpenAI CUA | Vision-driven |
| Playwright | Microsoft Playwright MCP server (March 2025) | DOM-driven + accessibility snapshots |
| Puppeteer | Cline's browser integration | DOM-driven |
| Stagehand | Browserbase's Stagehand framework | DOM + LLM hybrid |
| Accessibility APIs | HyperAgent, Multion mobile, Rabbit R1/DLAM | Accessibility tree |
| PyAutoGUI | Legacy approach; still used in Open Interpreter scenarios | OS-level cursor control |
| trycua | Open Interpreter native app control | OS-level control |

DOM-driven stacks (Playwright, Puppeteer, Stagehand) are 12-17 percentage points more reliable on common web tasks. Vision-driven stacks (Anthropic CU API, OpenAI CUA) unlock workloads no DOM approach can reach: PDFs, desktop apps, legacy thick clients, and any UI without a stable DOM.

### Safety Mechanisms for Computer Control

The surveyed tools exhibit four distinct safety patterns:

1. **Per-action human approval (Cline model)**: Every browser action shown to operator before execution. Maximum safety, minimum autonomy. Good for Tier-3 gate compliance.
2. **Sandbox isolation (Anthropic/Devin/Replit model)**: Computer-use runs inside a Docker container or VM with no access to operator's home directory, credentials, or network except what is explicitly granted. ZIBBY's most appropriate safety pattern for Tier-2 browser tasks.
3. **Session-scoped authentication (HyperWrite/Chrome extension model)**: Extension runs in the operator's live browser session. Convenient but highest-risk: the agent has full access to every logged-in session.
4. **Remote screen-share (Rabbit DLAM model)**: The AI sees the screen via screen-share and sends control signals remotely. Adds latency but keeps execution on the operator's hardware.

### Patterns That Map to ZIBBY's Tiered Gate System

- **Tier 1 (Act silently)**: Read-only screenshot analysis — the agent takes a screenshot, reads the screen state, extracts information. No control actions. Maps cleanly to `screenshot` action only.
- **Tier 2 (Act, then report)**: Fully sandboxed browser actions (form-fill, navigation, data extraction from web) in an isolated Docker container with no access to operator credentials or filesystem. The container is ephemeral; results are written to the vault as files.
- **Tier 3 (Surface and wait)**: Any action on the operator's actual desktop, any browser action in the operator's authenticated session, any action that modifies data outside the sandbox. Requires explicit per-action approval before execution.
- **Never**: Auto-login using stored credentials, auto-fill payment information, actions in financial or legal web applications.

### Current Limitations and Failure Modes

1. **Prompt injection**: Malicious content on web pages can instruct the AI to take unintended actions. Anthropic's classifiers have improved (Sonnet 4.6) but the risk is not zero. ZIBBY's gate must treat all browser-derived content as untrusted.
2. **Vision accuracy on dense UIs**: Small buttons, overlapping elements, and non-standard fonts cause misclick rates to rise significantly. The zoom action in `computer-use-2025-11-24` partially addresses this.
3. **CAPTCHAs and bot detection**: Vision-driven agents are detected and blocked by most modern anti-bot systems. DOM-driven approaches using real browser sessions (Chrome extension, Playwright with stealth) fare better.
4. **Authentication state**: Headless browsers start with no cookies. The operator must either inject session cookies, use OAuth flows, or use a persistent browser profile. Each approach has security tradeoffs.
5. **Screen resolution sensitivity**: Coordinates returned by the Computer Use API are pixel-absolute. Retina/HiDPI screens require explicit display scaling configuration.
6. **Latency per action**: A full Computer Use loop (screenshot → API call → action → screenshot) takes 2-8 seconds per step. Complex 20-step tasks can take 2-3 minutes at low error rate; error recovery multiplies this significantly.

---

## Prioritized Feature Backlog (Recommendations)

The following 15 features are ranked by their combined impact on the single-operator personal use case and architectural readiness. Phases continue from Phase 52.

---

### Phase 52 — Proactive Channel Watching (Email + Slack Triage)
**Description**: Heartbeat daemon that reads the operator's inbox and Slack workspace, classifies messages by urgency and type, drafts responses for routine items (Tier 2), and surfaces non-routine items for operator decision (Tier 3). Mirrors what Lindy AI does but self-hosted and gate-compliant.
- **Effort**: M (1-2 weeks)
- **Impact**: H — This is the core of Autonomous mode; without it ZIBBY only operates in Directed mode
- **Architectural impact**: New trigger source (channel-watcher executor type); new gate category (outbound-communication); inbox-state file written to vault after each heartbeat
- **Conflicts with ZIBBY principles**: None. Drafts are files; sends are Tier-2 gated. No vector DB needed.

---

### Phase 53 — MCP Protocol Support (Server + Client)
**Description**: Implement ZIBBY as an MCP host that can connect to any MCP server (Playwright, browser-use, web-search, DB connectors, etc.) and expose ZIBBY's own agents as MCP tools for third-party clients. Per-MCP-call gate enforcement (each tool call requires gate evaluation).
- **Effort**: M (1-2 weeks)
- **Impact**: H — Unlocks hundreds of community-built tools (Cline MCP Marketplace pattern); enables Playwright browser automation, structured web search, database connectors without custom code
- **Architectural impact**: New executor kind (`mcp-tool` call inside existing executor); ts-rest contract layer needs MCP tool-call endpoint; gate evaluates each MCP tool call independently
- **Conflicts with ZIBBY principles**: None. MCP is stateless JSON-RPC; files can be written as output; no vector DB.

---

### Phase 54 — Sandboxed Browser Computer Use (Tier-2)
**Description**: Playwright-based browser executor running in a Docker container with no access to operator credentials or host filesystem. The agent navigates public web pages, fills forms, extracts data, and writes results to the vault. All output is files. Container is ephemeral per task.
- **Effort**: M (1-2 weeks)
- **Impact**: H — Enables web research, form automation, price monitoring, data extraction — all the Tier-2 browser tasks
- **Architectural impact**: New executor kind (`browser` discriminant in the union); new gate category (`web-action`) mapping to Tier-2 by default; Docker sandbox required; results written to vault files
- **Conflicts with ZIBBY principles**: None. Sandbox isolation preserves the operator's system. Results are files.

---

### Phase 55 — Anthropic Computer Use (Desktop Control, Tier-3 Gate)
**Description**: Full desktop computer-use executor using `computer-use-2025-11-24` API. All desktop actions are Tier-3 by default — operator sees the planned action sequence and approves before execution. Runs in an isolated Linux VM or Docker container with X11 or VNC. Screenshot context flows back through the ts-rest contract layer as a base64 image attachment on the agent run record.
- **Effort**: L (1 month)
- **Impact**: H — Closes the largest capability gap vs all competitors; enables ZIBBY to operate any GUI software on behalf of the operator
- **Architectural impact**: New executor kind (`computer-use`); new gate category (`desktop-action`, Tier-3 mandatory); screenshot/visual context stored as files in vault (PNG alongside the run record); VM/Docker sandbox required; display server (Xvfb) needed for headless operation
- **Conflicts with ZIBBY principles**: None. All actions are Tier-3 gated. Screenshots become files in the vault.

---

### Phase 56 — Voice I/O (STT + TTS, Local Stack)
**Description**: Implement the already-planned voice pipeline: faster-whisper for STT, Kokoro-82M for TTS, Ollama for orchestration. Triggered by push-to-talk from the web UI or a dedicated hardware button. Voice commands dispatch to ZIBBY's existing agent/pipeline/orchestrator routing. Voice output reads back agent responses, gate questions, and briefings.
- **Effort**: M (1-2 weeks)
- **Impact**: H — Transforms ZIBBY from a browser-UI tool to an always-available butler; critical for the JARVIS metaphor; completely self-hosted stack already defined
- **Architectural impact**: New input channel (voice); audio I/O API endpoints in NestJS; STT output feeds existing task dispatcher; TTS output channel; no new gate categories needed (voice commands go through existing tier classification)
- **Conflicts with ZIBBY principles**: None. Stack is 100% local (faster-whisper + Kokoro + Ollama); no cloud STT/TTS.

---

### Phase 57 — Cost/Token Budget Enforcement
**Description**: Per-project and per-autonomy-tier token/API-cost budgets. Before executing any multi-step agent task, ZIBBY estimates the cost (model × estimated tokens) and checks against the budget. If it would exceed the budget, it surfaces a Tier-3 gate: "This task will cost approximately $X; approve to proceed." Running cost tracked in a file in the vault.
- **Effort**: S (days)
- **Impact**: M — Prevents runaway spend during Autonomous mode; critical when multi-step tasks run overnight
- **Architectural impact**: New gate condition (cost-cap); cost estimation pre-execution; running cost ledger file in vault; per-project budget configuration in project governance files
- **Conflicts with ZIBBY principles**: None. Budget is a file; cost ledger is a file.

---

### Phase 58 — Repo Map / AST-Aware Context Selection (Kodér Agent)
**Description**: Implement Aider-style repository map for the Kodér agent: AST-aware selection of the minimal set of files relevant to the current task, rather than injecting the full repository into context. Reduces token cost and improves accuracy on large codebases.
- **Effort**: S (days)
- **Impact**: M — Significant token savings and accuracy improvement for code tasks in large repos; enables ZIBBY to work on larger projects without context-window overflow
- **Architectural impact**: New context-selection module in Kodér agent; AST parsing (tree-sitter or similar) per supported language; no new gate categories; results are ephemeral (not stored in vault)
- **Conflicts with ZIBBY principles**: None. AST parsing is local; no vector DB (graph-based, not embedding-based).

---

### Phase 59 — Codebase Wiki Auto-Generation (Devin Wiki pattern)
**Description**: Background task that analyzes the connected project's codebase on a schedule and generates/updates a Markdown architecture wiki in the Obsidian vault. Wiki covers module structure, dependency graph, key interfaces, and recent changes. Updates every few hours or on git push.
- **Effort**: M (1-2 weeks)
- **Impact**: M — Dramatically reduces context-setting time at the start of each agent session; the wiki becomes a fast index-first memory entry point for the project
- **Architectural impact**: New scheduled executor (wiki-generator); outputs to vault as Markdown files; integrates with existing MOC system; no vector DB (the wiki IS the index)
- **Conflicts with ZIBBY principles**: None. Wiki is Markdown files in the vault. Index-first exactly.

---

### Phase 60 — CI/CD Status Integration (PR Gate Feedback Loop)
**Description**: After ZIBBY opens a PR, subscribe to the repository's CI status via GitHub webhook. On CI failure, ZIBBY automatically re-enters the Kodér → Code-Review → Tester cycle with the CI failure as context. On CI success, ZIBBY sends a Tier-3 briefing: "PR #N passed CI — ready to merge at your approval."
- **Effort**: S (days)
- **Impact**: M — Closes the software-delivery loop; ZIBBY currently stops at PR creation; this makes it a true Kodér⇄Code-Review⇄Tester cycle that also monitors CI
- **Architectural impact**: New inbound channel (GitHub webhook listener in NestJS); new trigger-to-agent path (CI failure → re-enter pipeline); new gate message type (CI-pass briefing)
- **Conflicts with ZIBBY principles**: None. CI results written to vault as files.

---

### Phase 61 — Multi-Modal Input (Screenshot / Image Attach)
**Description**: Allow operators to attach screenshots, photos, or diagrams to task descriptions. Screenshots of bugs, design mockups, or error messages become first-class task context. The gate UI can include a screenshot of the proposed action for Tier-3 confirmation.
- **Effort**: S (days)
- **Impact**: M — Bug reports with screenshots, UI design via mockup, Computer Use gate confirmations with visual preview — all enabled by image attachment
- **Architectural impact**: Image attachment on task input (ts-rest contract update); image stored as file in vault (PNG alongside task record); passed to agent as vision input; gate UI renders image in approval request
- **Conflicts with ZIBBY principles**: None. Images are files.

---

### Phase 62 — Authenticated Browser Session (Chrome Profile Integration)
**Description**: Allow the sandboxed browser executor to use a persistent Chrome profile (stored on the operator's machine, outside the container) for authenticated sessions. The profile is mounted read-only into the container for each task, giving the agent access to existing login sessions without requiring credential injection. Profile is never transmitted externally.
- **Effort**: M (1-2 weeks)
- **Impact**: M — Solves the authentication problem for browser automation without credential exposure; enables tasks on services where the operator is already logged in
- **Architectural impact**: Chrome profile mount in Docker executor; profile path configured per operator; gate category (`authenticated-web-action`) inherits all Tier-2 browser gates plus a profile-access permission check
- **Conflicts with ZIBBY principles**: None — profile stays on operator's machine; no credentials in vault or transmitted to API.

---

### Phase 63 — Proactive Anomaly Watch (Log / Metric Monitoring)
**Description**: Daemon that watches application logs, error monitoring (Sentry), and system metrics for the operator's projects. On anomaly detection, ZIBBY classifies the event: known pattern → auto-remediate (Tier 2); unknown pattern → surface to operator with full context (Tier 3). Remediation record written to vault.
- **Effort**: L (1 month)
- **Impact**: M — Enables the "watch my channels and handle what you can" use case for infrastructure; transforms ZIBBY from a task executor into a true autonomous site reliability assistant
- **Architectural impact**: New trigger source (log-watcher / webhook from monitoring tools); new gate category (infrastructure-action); remediation actions wrapped in existing Tier-2/3 gate; all events logged as vault files
- **Conflicts with ZIBBY principles**: None.

---

### Phase 64 — ACI-Pattern Tool Interface for Kodér Agent (SWE-agent pattern)
**Description**: Replace the Kodér agent's raw bash tool with an ACI-inspired structured interface: `view_file(path, line_range)`, `edit_file(path, old_str, new_str)`, `search_repo(pattern)`, `run_tests(filter)`, `apply_patch(diff)`. Matches mini-SWE-agent's finding that structured tools produce 2x better outcomes vs raw bash with identical models.
- **Effort**: M (1-2 weeks)
- **Impact**: M — Improved code-editing accuracy; reduced context waste; fewer failed edits that require undo
- **Architectural impact**: New tool definitions for Kodér agent; ts-rest endpoints for each ACI tool; these tools are internal (not MCP-exposed); no new gate categories (existing terminal/file-write gate applies)
- **Conflicts with ZIBBY principles**: None.

---

### Phase 65 — Mobile Web UI (Progressive Web App)
**Description**: Convert ZIBBY's Next.js frontend to a Progressive Web App with offline capability and push notifications. Enables the operator to approve Tier-3 gates, review briefings, and dispatch tasks from a phone. No native app required.
- **Effort**: M (1-2 weeks)
- **Impact**: L — Useful for gate approvals when away from desk; low-effort given Next.js foundation; avoids needing a native mobile app
- **Architectural impact**: PWA manifest + service worker in Next.js; push notification subscription endpoint in NestJS; gate approval deep-links work from push notification
- **Conflicts with ZIBBY principles**: None.

---

### Phase 66 — Scheduled / Cron-Based Autonomous Tasks
**Description**: Allow tasks and pipelines to be triggered on a schedule (cron expression) or recurrence (daily briefing at 08:00, weekly project status report on Monday, nightly CI health check). The schedule is stored as a file in the vault; the dispatcher reads it on heartbeat. Pairs directly with Phase 52 (channel watching) and Phase 63 (anomaly watch).
- **Effort**: S (days)
- **Impact**: M — Closes the gap with Lindy, Notion AI Custom Agents, and Replit Agent 3's scheduled automation; enables the "butler's morning briefing" use case central to ZIBBY's vision
- **Architectural impact**: Cron trigger executor in NestJS; schedule stored as YAML/JSON file in vault; no new gate categories (scheduled tasks inherit the tier of their constituent actions)
- **Conflicts with ZIBBY principles**: None. Schedules are files.

---

## Computer Use Implementation Path

### How ZIBBY Should Implement Computer Control

#### Which Anthropic APIs to Use

Use the `computer-use-2025-11-24` beta header with Claude Sonnet 4.6 as the default model (improved prompt injection resistance per Anthropic's own benchmarks; lower cost than Opus 4.x). The three tool types to register:

```
computer_20251124       — mouse, keyboard, screenshot, zoom (enable_zoom: true)
bash_20250124           — terminal execution within the sandbox
text_editor_20250124    — file editing with undo/redo support
```

For zoom: pass `enable_zoom: true` in the `computer_20251124` tool definition. This enables the `zoom` action for high-DPI inspection of small UI elements — critical for accurately interacting with dense UIs.

The agentic loop runs inside the NestJS API. Each turn: take screenshot → POST to Anthropic with screenshot + tool definitions → parse `tool_use` block from response → execute action in sandbox → capture result screenshot → repeat until `stop_reason: end_turn`.

#### Where It Fits in the Gate System

All Computer Use actions must default to Tier-3. The gate evaluates the full action sequence plan (shown to operator before the loop starts), not individual actions mid-loop.

The implementation structure:
1. Operator describes the computer-use task in natural language
2. The `computer-use` executor produces an action plan (what it intends to click/type/navigate)
3. Gate presents the plan for Tier-3 approval: "I plan to open Firefox, navigate to X, fill in Y, and click Submit. Approve?"
4. On approval, the loop executes in the sandbox
5. On unexpected branches (a dialog appears that was not in the plan), the loop pauses, takes a screenshot, and surfaces a mid-task Tier-3 gate before continuing
6. All screenshots taken during the session are written to the vault as PNG files alongside the run record

**Never-tier exceptions hardcoded**: no computer-use action targeting banking/financial apps, no computer-use action involving credential entry fields (password managers, login forms with `type=password`), no file deletion actions via the bash tool.

#### Suggested Agent Definition Structure

New discriminant in ZIBBY's executor union:

```typescript
{
  kind: "computer-use",
  sandboxImage: string,        // e.g. "ghcr.io/anthropics/computer-use-demo:latest" or custom
  displayWidth: number,        // Default 1280
  displayHeight: number,       // Default 768
  model: string,               // Default "claude-sonnet-4-6"
  maxTurns: number,            // Hard cap, default 50; prevents runaway loops
  allowedUrls?: string[],      // Whitelist for browser navigation (enforced by firewall rule in container)
  chromeProfile?: string,      // Path to mounted read-only Chrome profile (Phase 62)
  gateCategory: "desktop-action",  // Tier-3 mandatory
}
```

The agent sidecar metadata (already implemented) records each turn's screenshot path, action taken, and gate decision — creating the full audit trail required by ZIBBY's "always answerable" law.

#### HUD Overlay / Confirmation UX Requirements

The gate UI for Computer Use approval must display:
1. A text description of the intended action sequence in plain English
2. A live or pre-recorded video/GIF preview of the planned UI path (generate by running a dry-run screenshot-only pass before requesting approval)
3. A diff-style view for any file edits the bash tool will make
4. Clearly labeled Approve / Modify / Cancel actions
5. Mid-task pause capability: a "pause now" WebSocket message from the frontend causes the loop to halt after the current action, take a screenshot, and present a gate with the current screen state

#### Playwright vs Native OS Control — Recommendation

**Use Playwright inside the Docker sandbox for all web-browser tasks (Phases 54-55).** Playwright is the correct choice because:
- DOM-driven actions are 12-17 percentage points more reliable than vision-driven clicks on standard web content
- Playwright MCP server (Microsoft, March 2025) provides an already-maintained MCP-compatible Playwright interface pluggable via Phase 53's MCP support
- Playwright runs deterministically; the Computer Use loop can fall back to the `computer_20251124` tool only when Playwright cannot find an element (hybrid pattern)

**Reserve the Anthropic Computer Use `computer_20251124` tool (vision-driven) for:**
- Legacy desktop applications (thick clients, Electron apps without remote debugging)
- PDFs and non-web documents
- Screen content with no accessible DOM (embedded charts, canvas elements, third-party widgets)
- Any GUI where Playwright cannot get reliable element handles

This hybrid pattern (Playwright primary, Computer Use vision as fallback) gives ZIBBY the reliability of DOM-driven automation with the universal reach of vision-driven control.

#### Safety Sandbox Approach

Use Docker for all computer-use execution:
- **Base**: Ubuntu 22.04 LTS with Xvfb (virtual framebuffer), Chromium, and Playwright pre-installed
- **Networking**: Container gets a dedicated network namespace. Only outbound HTTPS is allowed; all other ports blocked. Operator can add URL allowlists per task.
- **Filesystem**: Container has an ephemeral `/workspace` volume for the current task. The operator's host filesystem is NOT mounted. Task outputs (files, screenshots, extracted data) are written to `/workspace` and then copied to the vault via the NestJS API after task completion.
- **Credentials**: No credentials are injected into the container. If authenticated browser access is needed (Phase 62), a read-only Chrome profile volume is mounted; the profile contains session cookies but no plaintext passwords.
- **Resources**: CPU and memory limits set in `docker run` to prevent runaway loops from consuming host resources
- **Cleanup**: Container is destroyed after each task. No state persists between computer-use sessions except what is explicitly written to the vault.

For the operator's local desktop (true desktop control, not web browser): reserve this for Tier-3 explicit approval only. Use the `computer_20251124` tool with a VNC or Xvfb stream. The action loop sends commands to the operator's actual X session only after per-action approval — no autonomous execution on the operator's live desktop without per-action confirmation.

#### How Screenshots Flow Through the ts-rest Contract Layer

Screenshots are binary data (PNG). The flow:

1. NestJS `computer-use` executor takes a screenshot inside the sandbox using `xwd` or Playwright's `page.screenshot()`
2. Screenshot is written to disk: `vault/runs/{run_id}/screenshots/{turn_number}.png`
3. The NestJS API exposes a ts-rest endpoint: `GET /runs/{run_id}/screenshots/{turn_number}` returning `Content-Type: image/png`
4. The Next.js frontend uses this endpoint to render the current screen state in the gate approval UI and in the run detail view
5. The Anthropic API call sends the screenshot as base64 inside the `image` content block (as required by the Computer Use API spec) — this conversion happens server-side in the NestJS executor and never touches the frontend
6. After task completion, a final screenshot is written as `vault/runs/{run_id}/screenshots/final.png` and appears in the run record markdown file as a relative image link, making it viewable in Obsidian

This keeps the ts-rest contract clean (typed endpoints, no binary blobs in JSON), the vault human-readable (PNG files with Markdown image links), and the Anthropic API calls encapsulated in the NestJS executor.

---

## Competitive Positioning Summary

| Dimension | Devin | Lindy AI | Cursor | Cline | Replit Agent 3 | **ZIBBY** |
|---|---|---|---|---|---|---|
| Self-hosted | Enterprise VPC only | No | No | Yes (MIT) | No | **Yes (by design)** |
| File-native memory | No | No | No | No | No | **Yes (Obsidian vault, index-first)** |
| Hardcoded gate / structural approval floor | Partial (plan + PR; not runtime policy) | Partial (per-step optional; configurable out) | Partial (auto-review; can be weakened) | Partial (human-in-loop; auto-approve toggle exists) | No | **Yes (tiered, non-configurable floor; inbound content cannot raise privileges)** |
| Multi-agent orchestration | Yes (parallel instances) | Yes (multi-Lindy) | Yes (background agents) | No (single session) | Yes (child agents, 160+ integrations) | **Yes (150+ agents; discriminated-union executor)** |
| Computer/browser use | Yes (sandboxed browser) | No | No | Yes (Puppeteer, per-step) | Yes (proprietary browser tester) | **Not yet (Phase 54/55)** |
| Voice I/O | No | No | No | No | No | **Planned (Phase 56; fully local stack)** |
| Email/Slack channel watching | No | Yes (core capability) | No | No | Yes (child agents) | **Planned (Phase 52)** |
| Git PR gate | Yes (mandatory PR checkpoint) | No | Yes (background agent PR) | Semi (manual or auto-approve) | Yes (PR creation + deploy) | **Yes (Tier-3 gate; ZIBBY stops at PR)** |
| Single-operator personal focus | No (team/enterprise) | Partial | No (team/enterprise) | Yes | No (cloud multi-project) | **Yes (designed exclusively for single operator)** |

### Where ZIBBY wins outright
- Structural, non-bypassable approval gate (the gate is a runtime floor, not a feature flag)
- File-native second brain with index-first retrieval (no vector DB dependency, no cloud lock-in)
- Self-hosted deployment with full data sovereignty
- Single-operator personal use case as first-class design priority
- Software delivery pipeline (Architekt → Kodér → Code-Review → Tester → Dokumentátor) as a first-class bounded state machine concept

### Where ZIBBY loses to specific competitors
- **Browser/desktop computer use**: Devin, Cline, Replit Agent 3, Multion all have it; ZIBBY has none yet
- **Email/Slack proactive channel watching**: Lindy is the clear leader; ZIBBY has it planned but not live
- **Plugin/MCP marketplace**: Cline has hundreds of MCP servers with one-click install; ZIBBY has no MCP support
- **Voice I/O**: Aider has it; Rabbit R1 is voice-native; ZIBBY has it planned but not live
- **Codebase wiki auto-generation**: Devin Wiki is the most mature; ZIBBY has no equivalent yet

### What is genuinely unique to ZIBBY and not replicated by any surveyed tool
1. The gate floor is hardcoded in POLICY.md and cannot be weakened by agent configuration, prompt injection, or inbound channel content — a property explicitly absent in every other tool
2. The Obsidian vault as index-first markdown second brain (MOCs + wikilinks + no vector DB) — all other memory systems use proprietary formats, vector stores, or SaaS cloud storage
3. The deliberate multi-specialist 150-agent architecture under a single-operator identity — Relevance AI has multi-agent workforces but they are multi-user enterprise SaaS, not a personal butler
4. The full software delivery pipeline as a bounded state machine with finite retries before parking for human review — no other tool implements this as a design constraint rather than a best-effort behavior

---

## Sources

- [Cursor Auto-review Agent Autonomy](https://cursor.com/blog/agent-autonomy-auto-review)
- [Cursor Pricing 2026](https://www.cloudzero.com/blog/cursor-ai-pricing/)
- [Cursor Background Agents Guide](https://ameany.io/cursor-background-agents/)
- [Cline Overview - Cline Docs](https://docs.cline.bot/cline-overview)
- [Cline MCP Marketplace](https://cline.bot/mcp-marketplace)
- [Cline - GitHub](https://github.com/cline/cline)
- [Continue.dev - GitHub](https://github.com/continuedev/continue)
- [Continue acquired by Cursor - The New Stack](https://thenewstack.io/cursor-acquires-continue-coding/)
- [Open Interpreter Review 2026](https://www.tooljunction.io/ai-tools/open-interpreter)
- [Open Interpreter - GitHub](https://github.com/openinterpreter/openinterpreter)
- [Aider Review 2026](https://aiagentslist.com/agents/aider)
- [Aider Documentation](https://aider.chat/docs/)
- [Anthropic Computer Use API Guide](https://www.digitalapplied.com/blog/anthropic-computer-use-api-guide)
- [Claude Computer Use Tool Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- [MultiOn 2026 Review - AGI-0](https://aiindigo.com/blog/multion-2026-review-the-agi-0-mobile-app-redefines-personal-automation)
- [MultiOn Documentation](https://docs.multion.ai/welcome)
- [HyperWrite AI Agent](https://www.hyperwriteai.com/aitools/ai-agent)
- [HyperAgent - GitHub](https://github.com/hyperbrowserai/HyperAgent)
- [Rabbit R1 2026 Update - DLAM and OpenClaw](https://www.rabbit.tech/blog/first-major-update-of-2026-dlam-openclaw-and-a-surprise)
- [Replit Agent 3 - Introducing Blog](https://blog.replit.com/introducing-agent-3-our-most-autonomous-agent-yet)
- [Devin AI Pricing](https://devin.ai/pricing/)
- [Devin 2.0 - VentureBeat](https://venturebeat.com/programming-development/devin-2-0-is-here-cognition-slashes-price-of-ai-software-engineer-to-20-per-month-from-500)
- [SWE-agent - GitHub](https://github.com/swe-agent/swe-agent)
- [SWE-agent 2.0 Overview](https://yuv.ai/blog/swe-agent-v2)
- [Open SWE - LangChain](https://www.langchain.com/blog/open-swe-an-open-source-framework-for-internal-coding-agents)
- [Mem.ai - State of AI Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- [Notion AI Review 2026](https://www.eesel.ai/blog/notion-ai-review)
- [Notion 3.3 Custom Agents Release](https://www.notion.com/releases/2026-02-24)
- [Lindy AI Review 2026](https://toolchase.com/blog/lindy-ai-review/)
- [Relevance AI Platform](https://relevanceai.com/)
- [Relevance AI Pricing 2026](https://checkthat.ai/brands/relevance-ai/pricing)
- [Browser Automation AI Agents - Playwright vs Stagehand](https://www.digitalapplied.com/blog/browser-automation-ai-agents-playwright-stagehand-2026)
- [Agentic Browser Landscape 2026](https://nohacks.co/blog/agentic-browser-landscape-2026)
- [Self-Hosted Voice AI Stack](https://dev.to/xadenai/building-a-local-voice-ai-stack-whisper-ollama-kokoro-tts-on-apple-silicon-eo0)
- [Cognition AI Valuation - SiliconANGLE](https://siliconangle.com/2026/04/23/cognition-creator-ai-software-engineer-devin-talks-raise-hundreds-millions-25b-valuation/)
