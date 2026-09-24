# TASK-032 — Implement Core Built-in Tools

Status: Completed

This document outlines the technical implementation plan for TASK-032, focusing on implementing the Version 1 native Built-in Tools using the standardized Tool SDK established in FEATURE-004.

---

## 1. Task Summary

The objective of **TASK-032** is to implement the first native Built-in Tools required by Version 1 of EOUS. These tools provide the initial platform capabilities while remaining fully compliant with the Tool SDK contracts, architectural principles, and development standards established by previous Features.

This task implements the following Built-in Tools:

* Calculator Tool
* TXT Reader Tool
* PDF Reader Tool
* Web Search Tool

Each tool must be implemented as a native Tool SDK implementation and remain completely independent from runtime orchestration, provider execution, UI components, and persistence mechanisms.

---

## 2. Scope

### TASK-032 Scope (In Scope)

* Implement Calculator Tool.
* Implement TXT Reader Tool.
* Implement PDF Reader Tool.
* Implement Web Search Tool.
* Implement Tool SDK-compliant manifests.
* Implement Tool metadata.
* Implement Tool parameter definitions.
* Implement Tool result definitions.
* Configure Built-in Tool exports.

### TASK-033 and TASK-034 Scope (Out of Scope)

* Tool Registry runtime.
* Tool Executor runtime.
* Runtime orchestration.
* Agent execution.
* Conversation execution.
* Dynamic loading.
* Marketplace.
* Plugin system.
* OCR.
* Image processing.
* Desktop automation.
* Local AI.
* Cloud synchronization.
* Business workflows.

---

## 3. Dependencies

TASK-032 depends on:

* **TASK-031 — Establish Built-in Tools Foundation** (Completed)
* **FEATURE-004 — Tool Management Foundation** (Completed)
* **FEATURE-007 — Conversation Foundation** (Completed)

Documentation:

* docs/00_EOUS_CONSTITUTION.md
* docs/01_PRD/V1.md
* docs/02_ARCHITECTURE/ARCHITECTURE.md
* docs/03_SDK/SDK.md
* docs/09_DEVELOPMENT_STANDARDS.md

---

## 4. Files Expected to Change

### Calculator Tool

#### [NEW] `src/tools/builtin/calculator/`

* Calculator Tool implementation.
* Calculator metadata.
* Calculator manifest.

---

### TXT Reader Tool

#### [NEW] `src/tools/builtin/text-reader/`

* TXT Reader Tool implementation.
* Metadata.
* Manifest.

---

### PDF Reader Tool

#### [NEW] `src/tools/builtin/pdf-reader/`

* PDF Reader Tool implementation.
* Metadata.
* Manifest.

---

### Web Search Tool

#### [NEW] `src/tools/builtin/web-search/`

* Web Search Tool implementation.
* Metadata.
* Manifest.

---

### Built-in Module

#### [MODIFY] `src/tools/builtin/index.ts`

* Export all Version 1 Built-in Tools.

---

### Documentation

#### [MODIFY] `project/tasks/TASK-032.md`

Update Status to **Completed**.

#### [MODIFY] `project/features/FEATURE-008.md`

Update TASK-032 status to **Completed**.

---

## 5. Risks

### Architecture Risks

**Introducing runtime execution**

Example:

* Tool Executor
* Runtime orchestration
* Scheduling

**Mitigation**

Each Built-in Tool must remain a Tool SDK implementation only.

---

### Dependency Risks

**Coupling Built-in Tools with higher layers**

Examples:

* Agent
* Conversation
* Provider
* UI
* Database

**Mitigation**

Built-in Tools may only depend on Tool SDK contracts and approved platform utilities.

---

### Scope Risks

**Implementing additional platform capabilities**

Examples:

* OCR
* Image processing
* Desktop control
* Marketplace
* Plugin system

**Mitigation**

Implement only the four Version 1 tools.

---

## 6. Questions

No blocking questions.

---

## 7. Detailed Step-by-Step Implementation Plan

### Step 1 — Implement Calculator Tool

Implement the Calculator Tool using the Tool SDK.

The implementation should include:

* Tool definition
* Metadata
* Manifest
* Parameter definitions
* Result definitions
* Public exports

The Calculator Tool should expose arithmetic capabilities only.

No expression history.

No persistence.

No UI.

---

### Step 2 — Implement TXT Reader Tool

Implement the TXT Reader Tool.

The implementation should include:

* Tool definition
* Metadata
* Manifest
* Input parameter definitions
* Output definitions

The tool should operate only on plain text files.

No editing.

No persistence.

No indexing.

---

### Step 3 — Implement PDF Reader Tool

Implement the PDF Reader Tool.

The implementation should include:

* Tool definition
* Metadata
* Manifest
* Input parameter definitions
* Output definitions

The tool should expose PDF reading capability only.

No OCR.

No annotation.

No editing.

No conversion.

---

### Step 4 — Implement Web Search Tool

Implement the Web Search Tool.

The implementation should include:

* Tool definition
* Metadata
* Manifest
* Parameter definitions
* Result definitions

The implementation should remain independent from any specific search provider.

No provider-specific integrations should be embedded.

---

### Step 5 — Configure Built-in Tool Exports

Update the Built-in Tool barrel.

Verify:

* Calculator exported.
* TXT Reader exported.
* PDF Reader exported.
* Web Search exported.

---

### Step 6 — Verify Tool SDK Compliance

Verify every Built-in Tool:

* Implements Tool SDK contracts.
* Uses standardized metadata.
* Uses standardized manifests.
* Uses approved Tool categories.
* Exposes only intended public contracts.

---

### Step 7 — Update Documentation

Update:

* project/tasks/TASK-032.md
* project/features/FEATURE-008.md

---

## 8. Validation Plan

### Verification Commands

```bash
pnpm exec tsc --noEmit

pnpm run lint

pnpm format:check

pnpm run build

pnpm tauri build --no-bundle
```

---

### Built-in Tool Audit

Verify:

* Calculator Tool exists.
* TXT Reader Tool exists.
* PDF Reader Tool exists.
* Web Search Tool exists.

---

### Tool SDK Audit

Verify every tool:

* Implements Tool SDK.
* Uses Tool metadata.
* Uses Tool manifest.
* Exposes approved contracts.

---

### Architecture Audit

Confirm there is still:

* no Tool Executor runtime
* no Tool Registry runtime
* no runtime orchestration
* no Agent execution
* no Conversation execution
* no Provider implementation
* no UI logic
* no Database logic
* no Infrastructure logic
* no business workflow

---

### Public API Audit

Verify:

* Built-in exports are complete.
* No internal helpers are exported.
* No circular dependencies exist.

---

## 9. Acceptance Criteria Checklist

- [ ] Calculator Tool implemented.
- [ ] TXT Reader Tool implemented.
- [ ] PDF Reader Tool implemented.
- [ ] Web Search Tool implemented.
- [ ] Tool SDK contracts implemented.
- [ ] Tool metadata implemented.
- [ ] Tool manifests implemented.
- [ ] Public exports configured.
- [ ] Project compiles successfully.
- [ ] Development build succeeds.
- [ ] Production build succeeds.
- [ ] Tauri build succeeds.

---

## 10. Definition of Done Checklist

- [ ] Core Built-in Tools completed.
- [ ] Tool SDK compliance verified.
- [ ] Public API verified.
- [ ] Documentation updated.
- [ ] Project validation completed.
- [ ] Changes reviewed.
- [ ] Ready for commit approval.
