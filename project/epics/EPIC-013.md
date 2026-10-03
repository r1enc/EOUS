# EPIC-013 — Version 1 Runtime Completion

Version: 1.0

Status: Planned

Owner: EOUS

---

# Roadmap Relationship

Phase 2 — Core Platform / Version 1 AI Foundation completion. This Epic closes runtime and product gaps left outside the completed EPIC-001, EPIC-002, and EPIC-003; it does not replace or reopen them. Phase 3 begins only after Version 1 release requirements are verified.

---

# Objective

Turn the completed architectural foundations into a usable Version 1 desktop runtime. A normal launch must load configured AI providers, create and resume conversations, route requests through the Agent and existing tools, and complete the documented user journey without test-only dependency injection.

---

# Scope

* Production OpenAI, Gemini, and Groq adapters behind the Provider Interface
* Local provider credentials and preferred provider/model configuration
* Real network-backed Web Search through the existing Tool SDK and Permission Manager
* Desktop composition root, startup states, and end-to-end Version 1 validation
* Explicit final audit of PRD FR-001 through FR-019

The Agent remains the coordinator. Provider-specific code belongs in Intelligence, persistence and network configuration in Infrastructure, and user settings in Presentation. Tools execute through the Tool SDK; the Permission Manager remains authoritative.

---

# Expected Deliverables

* Three interchangeable production provider adapters with normalized completion, streaming, and failures
* Safe local provider configuration and a usable settings path
* Web Search that returns real results or a bounded failure, never simulated production results
* A normally launched desktop app with a configured, persistent conversation workspace
* Mocked adapter/tool tests and real desktop end-to-end release evidence

---

# Features

| Feature ID | Title | Status |
| --- | --- | --- |
| FEATURE-014 | Provider Runtime Integrations | Planned |
| FEATURE-015 | Provider Configuration and Preferences | Planned |
| FEATURE-016 | Web Search Runtime | Planned |
| FEATURE-017 | Desktop Runtime Bootstrap and V1 Validation | Planned |

---

# Dependencies

* EPIC-001 — Project Foundation
* EPIC-002 — Core Platform, including Provider Management Foundation, Tool SDK, Agent, Permission System, and Workspace Integration
* EPIC-003 — Conversation System, including persistence, navigation, streaming, and Markdown

---

# Related Documents

* docs/00_EOUS_CONSTITUTION.md
* docs/01_PRD/V1.md
* docs/02_ARCHITECTURE/ARCHITECTURE.md
* docs/03_SDK/SDK.md
* docs/04_UI_UX/UI_UX.md
* docs/05_ROADMAP.md
* docs/06_DECISIONS.md
* docs/09_DEVELOPMENT_STANDARDS.md
* planning/06_EPICS.md
* planning/08_TASKS.md
* project/epics/EPIC-001.md
* project/epics/EPIC-002.md
* project/epics/EPIC-003.md
* project/features/FEATURE-014.md
* project/features/FEATURE-015.md
* project/features/FEATURE-016.md
* project/features/FEATURE-017.md

---

# Exit Criteria

Do not mark this Epic Completed merely because its planning files exist. Completion requires:

* FEATURE-014 through FEATURE-017 and TASK-055 through TASK-067 Completed.
* OpenAI, Gemini, and Groq each work behind the existing Provider Interface; provider failures are isolated.
* A user can configure credentials and preferred provider/model without known secret leakage into logs, source, or user-facing errors.
* A normal Tauri launch loads configuration, initializes persistence and providers, and presents a usable workspace without test-only injection.
* Users can create, reopen, and continue conversations; streamed responses display correctly and a completed response persists once.
* Calculator, TXT Reader, PDF Reader, and real Web Search work through the Tool SDK. Web Search never returns simulated production results.
* Sensitive tool actions require Permission Manager approval; rejection, provider failure, and tool failure remain isolated with safe public errors.
* Relevant Node, browser, and integration tests, lint, formatting, production build, and Tauri launch pass.
* TASK-067 records an explicit evidence-based audit of PRD FR-001 through FR-019 and the complete Version 1 user journey. Version 1 release readiness is claimed only after that audit passes.

---

# Out of Scope

Phase 3 Context Management, Long-Term Memory, advanced Planning Engine, Multi-Step Reasoning expansion, provider optimization or failover, workflow automation, Plugin Marketplace, Local AI or Ollama, Image Studio, Data Analyst or Machine Learning modules, desktop control, multi-agent work, cloud synchronization, enterprise capabilities, and unrelated UI redesign.
