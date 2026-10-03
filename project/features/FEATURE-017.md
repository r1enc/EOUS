# FEATURE-017 — Desktop Runtime Bootstrap and V1 Validation

Version: 1.0

Status: Planned

Owner: EOUS

---

# Epic

EPIC-013 — Version 1 Runtime Completion

---

# Objective

Compose existing Version 1 components into the normal desktop startup path and validate the complete Version 1 experience.

---

# Scope

* Application composition root, database and conversation storage initialization
* Provider configuration loading, ProviderRegistry population, and preferred provider/model resolution
* ConversationNavigation creation and normal App startup with loading/failure states
* Full Version 1 end-to-end and PRD FR-001 through FR-019 validation

TASK-066 connects existing components rather than rebuilding Agent, Conversation, Workspace, Provider Interface, Tool SDK, or Permission Manager. TASK-067 is a release-validation task, not feature expansion.

---

# Expected Deliverables

* A normal Tauri launch that reaches a configured usable conversation workspace
* Launch → configuration → persistence/providers → conversation → Agent → provider or approved tool → response → persisted history
* Safe startup recovery for missing configuration or storage/provider failures
* Evidence-based Version 1 user-journey and FR-001 through FR-019 audit

---

# Tasks

| Task ID | Title | Status |
| --- | --- | --- |
| TASK-066 | Build Desktop Application Composition Root | Planned |
| TASK-067 | Validate Version 1 End-to-End Runtime | Planned |

---

# Dependencies

* FEATURE-011 through FEATURE-013 — Completed conversation experience
* FEATURE-014 — Provider Runtime Integrations
* FEATURE-015 — Provider Configuration and Preferences
* FEATURE-016 — Web Search Runtime

---

# Related Documents

* docs/00_EOUS_CONSTITUTION.md
* docs/01_PRD/V1.md
* docs/02_ARCHITECTURE/ARCHITECTURE.md
* docs/03_SDK/SDK.md
* docs/04_UI_UX/UI_UX.md
* docs/09_DEVELOPMENT_STANDARDS.md
* project/epics/EPIC-013.md
* project/epics/EPIC-003.md
* project/features/FEATURE-014.md
* project/features/FEATURE-015.md
* project/features/FEATURE-016.md

---

# Exit Criteria

TASK-066 and TASK-067 are complete. A real Tauri launch provides a configured workspace without injected test dependencies; users create, reopen, and continue persisted conversations; streamed and final responses, tools, approval/rejection, and failure recovery work. TASK-067 records passing Node/browser/integration tests, lint, format, production build, desktop launch, and an explicit FR-001 through FR-019 audit before any Version 1 release-readiness claim.

---

# Out of Scope

New Agent capabilities, tool or provider redesign, unrelated UI work, Phase 3 features, and release claims based only on mocked or browser-only startup.
