# TASK-058 — Implement Groq Provider Adapter

Version: 1.0

Status: Completed

Owner: EOUS

---

# Feature

FEATURE-014 — Provider Runtime Integrations

---

# Objective

Implement one production Groq adapter behind the existing Provider Interface.

---

# Scope

* Map provider-neutral messages, model, and options to Groq requests using supplied configuration and credentials.
* Normalize synchronous completion, ordered streaming deltas, terminal results, usage where available, and failures.
* Use mocked provider responses for success, partial stream, timeout, malformed data, and authentication failure.

Out of scope for this Task: OpenAI or Gemini adapters; settings UI; registry population; Agent changes.

---

# Acceptance Criteria

* The adapter satisfies Provider and its optional streaming contract with a configured model and credential.
* Mocked completion and stream tests prove one terminal event and standardized output.
* Provider errors and public messages omit credentials and private response details.

---

# Dependencies

* TASK-055 — Provider Runtime Adapter Foundation

---

# Estimated Complexity

M

---

# Relevant Components

* `src/intelligence/`
* `src/intelligence/provider-sdk/`
* `tests/`

---

# Related Documents

* docs/01_PRD/V1.md
* docs/02_ARCHITECTURE/ARCHITECTURE.md
* docs/09_DEVELOPMENT_STANDARDS.md
* project/epics/EPIC-013.md
* project/features/FEATURE-014.md

---

# Definition of Done

The acceptance criteria are verified; focused tests and applicable build or lint checks pass; architectural boundaries remain intact; and this Task is independently reviewable as one logical commit.
