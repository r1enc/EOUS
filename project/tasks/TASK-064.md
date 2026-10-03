# TASK-064 — Implement Real Web Search Backend

Version: 1.0

Status: Planned

Owner: EOUS

---

# Feature

FEATURE-016 — Web Search Runtime

---

# Objective

Replace WebSearchTool's simulated result source with one audited network-backed search implementation.

---

# Scope

* Audit candidate backends for maintenance, API terms, authentication, cost/free tier, desktop compatibility, and response stability before selection.
* Call the selected backend only from the tool execution path after existing network approval.
* Map successful backend results to the current title, URL, and snippet output contract where practical.

Out of scope for this Task: Crawling, multiple-backend aggregation, unrelated Tool SDK changes, simulated production fallback.

---

# Acceptance Criteria

* An approved invocation obtains real backend results rather than hard-coded example.com content.
* The existing network permission manifest remains in force and denied requests make no backend call.
* Deterministic mocked transport tests cover result normalization and malformed responses; backend choice and tradeoffs are documented.

---

# Dependencies

* FEATURE-008 — Built-in Tools Foundation
* TASK-061 — Credential and Preference Persistence (for backend configuration if needed)

---

# Estimated Complexity

M

---

# Relevant Components

* `src/tools/builtin/web-search/`
* `src/infrastructure/ (only for backend configuration)`
* `tests/`

---

# Related Documents

* docs/00_EOUS_CONSTITUTION.md
* docs/01_PRD/V1.md
* docs/02_ARCHITECTURE/ARCHITECTURE.md
* docs/03_SDK/SDK.md
* docs/09_DEVELOPMENT_STANDARDS.md
* project/epics/EPIC-013.md
* project/features/FEATURE-016.md

---

# Definition of Done

The acceptance criteria are verified; focused tests and applicable build or lint checks pass; architectural boundaries remain intact; and this Task is independently reviewable as one logical commit.
