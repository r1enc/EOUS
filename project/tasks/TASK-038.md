# TASK-038 — Define Sensitive Action Classification

Version: 1.0

Status: Completed

Owner: EOUS

---

# Feature

FEATURE-009 — Permission System Foundation

---

# Objective

Define the shared Sensitive Action Classification Foundation used to consistently classify operations requiring user approval throughout the EOUS platform.

This task introduces only the shared classification models.

No runtime classification, permission evaluation, or approval workflow is introduced.

---

# Scope

This task includes:

* Define SensitiveAction
* Define SensitiveActionCategory
* Define SensitiveActionSeverity
* Define SensitiveActionMetadata
* Configure public exports

This task does **not** include:

* Permission validation
* Runtime classification
* Approval workflow
* Policy Engine
* Tool execution
* Agent execution
* Business logic
* User interface

---

# Acceptance Criteria

* SensitiveAction defined.
* SensitiveActionCategory defined.
* SensitiveActionSeverity defined.
* SensitiveActionMetadata defined.
* Public exports configured.
* TypeScript compiles successfully.
* Development build succeeds.
* Production build succeeds.
* Tauri application builds successfully.

---

# Dependencies

Depends on:

* TASK-037 — Define Permission Policies

---

# Estimated Complexity

M

---

# Related Documents

Documentation

* docs/00_EOUS_CONSTITUTION.md
* docs/01_PRD/V1.md
* docs/02_ARCHITECTURE/ARCHITECTURE.md
* docs/05_ROADMAP.md
* docs/06_DECISIONS.md
* docs/09_DEVELOPMENT_STANDARDS.md

Planning

* planning/05_ARCHITECTURE_MAPPING.md
* planning/07_FEATURES/FEATURE-009.md

Project

* project/features/FEATURE-009.md

---

# Architecture Notes

Sensitive Action Classification defines only the standardized taxonomy of operations that may require user approval.

It does not determine whether an action is allowed or denied.

Do not introduce:

* runtime classification
* permission evaluation
* approval decisions
* Tool execution
* Agent execution
* business workflows

---

# Definition of Done

* Sensitive Action Classification completed.
* Public API updated.
* Architecture preserved.
* Project validation completed.
* Changes reviewed.
* Changes committed.
