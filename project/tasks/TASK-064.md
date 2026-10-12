# TASK-064 — Implement Real Web Search Backend

Version: 1.0

Status: Completed

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

---

# Implementation and Release Note (2026-10-12)

Tavily Search API is the sole Version 1 backend. Each user supplies a Tavily key (BYOK), stored under a separate fixed Windows Credential Manager target with Local persistence. Only status, set, and remove credential commands are exposed; search retrieves the key inside Rust. The native command sends one HTTPS POST to Tavily's fixed endpoint with Bearer authentication, `search_depth: basic`, at most five results, and answer, raw content, images, and automatic parameters disabled. It has finite timeouts, no redirects, and a bounded response. The Tool SDK still requires `network` approval before invoking the injected backend; denied requests make zero backend calls. Results retain the existing title/URL/snippet contract and reject unsafe URLs. The simulated production results are removed.

Backend choice was reviewed against the [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search), [rate limits](https://docs.tavily.com/documentation/rate-limits), [pricing](https://www.tavily.com/pricing), and [Platform Terms](https://www.tavily.com/terms) on 2026-10-12. The published free tier was 1,000 API credits per month, and the documented basic search cost was one credit per request; pricing and limits can change. Tavily documents Customer Application integration, but its internal-business-use wording leaves public personal-use BYOK distribution uncertain. Whether persisted assistant answers incorporating search results are permitted also needs clarification. Brave and Bing were considered during planning and rejected for this V1 implementation because their terms, availability, and pricing did not give a clearer fit for the approved desktop BYOK flow. Search queries are sent to Tavily; users should avoid private data in queries. The application does not store the API key in SQLite, localStorage, or source. Main-window Tauri IPC remains a trusted application boundary and is not itself the Tool SDK permission gate.

**Public-release gate:** Before publicly distributing EOUS with Tavily enabled, confirm that Tavily's terms cover the intended personal-use BYOK desktop integration and persisted-answer behavior, preferably in writing. TASK-067 must report this gate as unresolved until verified; Version 1 is not public-release ready while it remains open. No legal clearance is asserted.

TASK-065 owns detailed network/auth/rate-limit/offline failure handling and Agent recovery. TASK-066 owns normal startup injection and settings navigation. No real Tavily key was available for a live request; deterministic mocked tests and native request-construction tests verify this task's behavior.
