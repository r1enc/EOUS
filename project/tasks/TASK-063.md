# TASK-063 — Wire Preferred Provider Selection into Workspace Runtime

Version: 1.0

Status: Completed

Owner: EOUS

---

# Feature

FEATURE-015 — Provider Configuration and Preferences

---

# Objective

Resolve the persisted preferred provider/model into Workspace creation through the existing registry.

---

# Scope

* Load and validate preferred provider/model from the configuration boundary.
* Select only a registered configured provider and pass the choice to existing Workspace construction.
* Return recoverable startup/selection feedback when the choice is missing or unavailable.

Out of scope for this Task: Settings UI; adapter implementation; provider optimization/failover; application composition root.

---

# Acceptance Criteria

* New Workspace instances use the persisted preferred provider/model, including after restart.
* A missing or unregistered preference cannot silently route to another provider.
* Injected registry/config tests confirm Agent receives only the selected Provider Interface.

---

# Dependencies

* TASK-059 — Runtime Provider Registry Integration
* TASK-061 — Provider Credential and Preference Persistence

---

# Estimated Complexity

S

---

# Relevant Components

* `src/workspace/`
* `src/intelligence/provider-sdk/`
* `tests/`

---

# Related Documents

* docs/01_PRD/V1.md
* docs/02_ARCHITECTURE/ARCHITECTURE.md
* docs/09_DEVELOPMENT_STANDARDS.md
* project/epics/EPIC-013.md
* project/features/FEATURE-015.md

---

# Definition of Done

The acceptance criteria are verified; focused tests and applicable build or lint checks pass; architectural boundaries remain intact; and this Task is independently reviewable as one logical commit.
