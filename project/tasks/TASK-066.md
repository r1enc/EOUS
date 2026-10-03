# TASK-066 — Build Desktop Application Composition Root

Version: 1.0

Status: Planned

Owner: EOUS

---

# Feature

FEATURE-017 — Desktop Runtime Bootstrap and V1 Validation

---

# Objective

Compose existing Version 1 services into the normal desktop startup path so App opens a usable configured workspace.

---

# Scope

* Initialize database and conversation storage, load provider configuration, populate ProviderRegistry, and resolve preferred provider/model.
* Create ConversationNavigation and pass it to App from the normal startup path.
* Present recoverable loading, missing-configuration, and startup-failure states without test-only dependency injection.

Out of scope for this Task: Rebuilding Agent, Conversation, Workspace, Tool SDK, Permission Manager, or provider adapters; release sign-off.

---

# Acceptance Criteria

* A normal Tauri launch can reach a usable conversation workspace using configured providers and persisted sessions.
* Startup errors remain safe and recoverable; an unconfigured install can reach configuration rather than a permanent unavailable screen.
* Browser and desktop smoke tests cover startup, conversation creation/open, and configuration loading.

---

# Dependencies

* TASK-059 — Runtime Provider Registry Integration
* TASK-062 — Provider Settings Interface
* TASK-063 — Preferred Provider Workspace Selection
* TASK-065 — Web Search Runtime Finalization
* FEATURE-011 through FEATURE-013 — Completed conversation foundation

---

# Estimated Complexity

M

---

# Relevant Components

* `src/main.tsx`
* `src/App.tsx`
* `src/workspace/`
* `src/infrastructure/database/`
* `tests/`

---

# Related Documents

* docs/00_EOUS_CONSTITUTION.md
* docs/01_PRD/V1.md
* docs/02_ARCHITECTURE/ARCHITECTURE.md
* docs/04_UI_UX/UI_UX.md
* docs/09_DEVELOPMENT_STANDARDS.md
* project/epics/EPIC-013.md
* project/features/FEATURE-017.md

---

# Definition of Done

The acceptance criteria are verified; focused tests and applicable build or lint checks pass; architectural boundaries remain intact; and this Task is independently reviewable as one logical commit.
