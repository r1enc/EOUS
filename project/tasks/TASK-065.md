# TASK-065 — Finalize Web Search Runtime and Failure Handling

Version: 1.0

Status: Planned

Owner: EOUS

---

# Feature

FEATURE-016 — Web Search Runtime

---

# Objective

Make the real Web Search path reliable and safe under permission, network, and backend failures.

---

# Scope

* Bound network execution and normalize timeout, authentication, rate-limit, malformed-response, and offline failures.
* Ensure results and failures remain within Tool SDK contracts and public errors reveal no credential/internal detail.
* Verify approved and denied behavior through the real Agent/Tool SDK/Permission integration boundary with mocked network.

Out of scope for this Task: A second backend, search failover, browsing/crawling, Agent changes.

---

# Acceptance Criteria

* Approved search returns normalized results; rejection prevents requests; failure creates no fabricated success.
* Backend failure does not break subsequent conversation turns or other tools.
* Integration tests prove standardized public errors and no secret/internal leakage.

---

# Dependencies

* TASK-064 — Real Web Search Backend

---

# Estimated Complexity

S

---

# Relevant Components

* `src/tools/builtin/web-search/`
* `tests/`

---

# Related Documents

* docs/01_PRD/V1.md
* docs/02_ARCHITECTURE/ARCHITECTURE.md
* docs/03_SDK/SDK.md
* docs/09_DEVELOPMENT_STANDARDS.md
* project/epics/EPIC-013.md
* project/features/FEATURE-016.md

---

# Definition of Done

The acceptance criteria are verified; focused tests and applicable build or lint checks pass; architectural boundaries remain intact; and this Task is independently reviewable as one logical commit.
