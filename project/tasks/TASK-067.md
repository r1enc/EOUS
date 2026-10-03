# TASK-067 — Validate Version 1 End-to-End Runtime

Version: 1.0

Status: Planned

Owner: EOUS

---

# Feature

FEATURE-017 — Desktop Runtime Bootstrap and V1 Validation

---

# Objective

Verify Version 1 release requirements against the normally launched desktop runtime and record an explicit PRD audit.

---

# Scope

* Exercise launch, configuration, create/open/continue conversation, Agent/provider response, tool selection, permission decision, streaming, and persistence after restart.
* Check Calculator, TXT Reader, PDF Reader, and real Web Search through Tool SDK.
* Audit FR-001 through FR-019 one by one with evidence and remaining limitations; run Node/browser/integration suites, lint, format, build, and Tauri launch.

Out of scope for this Task: Feature expansion, new provider/tool architecture, Phase 3 work, declaring readiness when a requirement lacks evidence.

---

# Acceptance Criteria

* The complete Version 1 user journey passes in the real desktop app without test-only injection.
* Provider, tool, permission, streaming, persistence, and failure-isolation boundaries are evidenced; no simulated production search remains.
* A written FR-001 through FR-019 audit identifies each requirement as verified or open with test/desktop evidence; release readiness is claimed only if all required checks pass.

---

# Dependencies

* TASK-066 — Desktop Application Composition Root
* FEATURE-014 — Provider Runtime Integrations
* FEATURE-015 — Provider Configuration and Preferences
* FEATURE-016 — Web Search Runtime

---

# Estimated Complexity

L

---

# Relevant Components

* `tests/`
* `src/main.tsx (inspection only unless a validation defect is found)`
* `project/epics/EPIC-013.md`

---

# Related Documents

* docs/00_EOUS_CONSTITUTION.md
* docs/01_PRD/V1.md
* docs/02_ARCHITECTURE/ARCHITECTURE.md
* docs/03_SDK/SDK.md
* docs/04_UI_UX/UI_UX.md
* docs/09_DEVELOPMENT_STANDARDS.md
* project/epics/EPIC-013.md
* project/features/FEATURE-017.md

---

# Definition of Done

The acceptance criteria are verified; focused tests and applicable build or lint checks pass; architectural boundaries remain intact; and this Task is independently reviewable as one logical commit.
