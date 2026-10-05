# TASK-061 — Implement Provider Credential and Preference Persistence

Version: 1.0

Status: Completed

Owner: EOUS

---

# Feature

FEATURE-015 — Provider Configuration and Preferences

---

# Objective

Persist provider credentials and preferred provider/model locally through an audited secure-storage approach.

---

# Scope

* Audit Tauri/Windows credential-storage capabilities and select a suitable mechanism before implementation.
* Persist and reload credentials and preferences through the TASK-060 boundary.
* Redact logs and public errors; handle absent, corrupt, or inaccessible storage safely.

Out of scope for this Task: Settings UI; provider adapter code; assuming SQLite plaintext is safe for secrets; cloud synchronization.

---

# Acceptance Criteria

* Credentials and preferences survive a normal restart where required without known plaintext leakage.
* Storage failure produces a recoverable, nonsecret result and never silently selects a different provider.
* Tests cover save/load/update, restart, corrupt data, and secret redaction; the security choice is documented with its limits.

---

# Dependencies

* TASK-060 — Provider Configuration Storage

---

# Estimated Complexity

M

---

# Relevant Components

* `src/infrastructure/`
* `src-tauri/ (only if the audited storage mechanism requires it)`
* `tests/`

---

# Related Documents

* docs/00_EOUS_CONSTITUTION.md
* docs/01_PRD/V1.md
* docs/02_ARCHITECTURE/ARCHITECTURE.md
* docs/09_DEVELOPMENT_STANDARDS.md
* project/epics/EPIC-013.md
* project/features/FEATURE-015.md

---

# Definition of Done

The acceptance criteria are verified; focused tests and applicable build or lint checks pass; architectural boundaries remain intact; and this Task is independently reviewable as one logical commit.

---

# Implementation Security Note

Provider secrets use Windows Credential Manager through `keyring-core` 1.0.0 and `windows-native-keyring-store` 1.1.0. Each supported provider has a fixed EOUS target and explicitly requests `Local` persistence. The native bridge exposes only get, set, and remove for `openai`, `gemini`, and `groq`; operations are serialized with one lock. An absent credential is distinct from corrupt data or unavailable storage. Already-missing removal succeeds; other delete failures do not.

Nonsecret runtime settings and the preferred provider/model use the existing SQLite `app_settings` table under `provider_settings.v1`. The stored JSON is validated and whitelisted; credential values are never intentionally written to SQLite, app files, or logs. The TASK-060 boundary supplies fixed public errors. A controlled Windows smoke test with a synthetic, isolated target verified Local persistence, read, overwrite, fresh backend access, delete, and missing state; its cleanup runs even if an assertion fails.

This protects secrets at rest from casual app-file inspection. A secret enters EOUS process and frontend memory when explicitly loaded for a provider request. A compromised running process, malicious code in the authorized frontend, or an equally privileged compromised Windows account can still access it. V1 implements the Windows backend; another OS backend can later replace it behind `ProviderConfigurationStorage` without changing callers. No insecure fallback is used when credential storage is unavailable.
