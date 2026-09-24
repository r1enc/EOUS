# TASK-031 — Establish Built-in Tools Foundation

Status: Completed

This document outlines the technical implementation plan for TASK-031, focusing on establishing the Built-in Tools Foundation under `src/tools/builtin/`.

---

## 1. Task Summary

The objective of **TASK-031** is to establish the Built-in Tools Foundation by creating the foundational module structure for all native Version 1 tools. This includes defining the base Built-in Tool abstraction, shared metadata models, category definitions, and public exports while leveraging the Tool SDK established in FEATURE-004.

The implementation must remain architecture-independent and must not introduce runtime execution, tool registration, or business behavior.

---

## 2. Scope

### TASK-031 Scope (In Scope)

* Create the Built-in Tools module structure.
* Define the base Built-in Tool abstraction.
* Define shared Built-in Tool metadata.
* Define Built-in Tool category definitions.
* Configure public barrel exports.
* Establish the reusable foundation that will be shared by Calculator, TXT Reader, PDF Reader, and Web Search tools.

### TASK-032, TASK-033, and TASK-034 Scope (Out of Scope for TASK-031)

* **TASK-032**: Implement Calculator Tool, TXT Reader Tool, PDF Reader Tool, and Web Search Tool.
* **TASK-033**: Configure Built-in Tool registration.
* **TASK-034**: Final verification and completion of FEATURE-008.
* Runtime Tool Registry.
* Runtime Tool Executor.
* Dynamic loading.
* Plugin Marketplace.
* Tool Marketplace.
* Third-party tools.
* Business logic.

---

## 3. Dependencies

TASK-031 depends on:

* **FEATURE-004 — Tool Management Foundation** (Completed)
* **FEATURE-007 — Conversation Foundation** (Completed)
* docs/00_EOUS_CONSTITUTION.md
* docs/01_PRD/V1.md
* docs/02_ARCHITECTURE/ARCHITECTURE.md
* docs/03_SDK/SDK.md
* docs/09_DEVELOPMENT_STANDARDS.md

---

## 4. Files Expected to Change

### [NEW] `src/tools/builtin/builtin-tool.ts`

* Declare the base Built-in Tool abstraction.

### [NEW] `src/tools/builtin/metadata.ts`

* Declare shared metadata contracts for Built-in Tools.

### [NEW] `src/tools/builtin/category.ts`

* Declare Built-in Tool category definitions.

### [NEW] `src/tools/builtin/index.ts`

* Configure the public module exports.

### [MODIFY] `project/tasks/TASK-031.md`

* Update Status: Completed

### [MODIFY] `project/features/FEATURE-008.md`

* Update TASK-031 status in the task table to `Completed`.

---

## 5. Risks

### Architecture Risks

**Premature runtime implementation**

*Mitigation:* Restrict implementation to TypeScript interfaces, types, metadata definitions, and module exports only.

### Dependency Risks

**Coupling to runtime components**

*Mitigation:* Do not import or reference Agent, Conversation, Provider runtime, Tool Executor, or UI components.

### Scope Risks

**Implementing actual tool behavior**

*Mitigation:* Do not implement Calculator, TXT Reader, PDF Reader, or Web Search functionality during this task.

---

## 6. Questions

No blocking questions.

---

## 7. Detailed Step-by-Step Implementation Plan

### Step 1: Create Built-in Tools Module

Create:

```
src/tools/builtin/
```

as the root module for all Version 1 native Built-in Tools.

---

### Step 2: Define Built-in Tool Categories

Create:

```
category.ts
```

Define standardized category types used by Built-in Tools.

---

### Step 3: Define Built-in Tool Metadata

Create:

```
metadata.ts
```

Define reusable metadata contracts describing native Built-in Tools.

---

### Step 4: Define Base Built-in Tool Abstraction

Create:

```
builtin-tool.ts
```

Define the common abstraction shared by every Built-in Tool while extending the existing Tool SDK contracts.

---

### Step 5: Configure Public Module Exports

Create:

```
index.ts
```

Export only the approved public contracts.

---

### Step 6: Update Documentation

Update:

* `project/tasks/TASK-031.md`
* `project/features/FEATURE-008.md`

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

### Foundation Audit

Verify:

* Built-in Tools module structure exists.
* Base Built-in Tool abstraction exists.
* Shared metadata contracts exist.
* Category definitions exist.
* Public exports are configured correctly.
* No runtime execution logic exists.
* No business logic exists.
* No Tool Registry runtime exists.
* No Tool Executor runtime exists.

---

## 9. Acceptance Criteria Checklist

- [ ] Built-in Tools Foundation established.
- [ ] Base Built-in Tool abstraction defined.
- [ ] Shared metadata contracts available.
- [ ] Category definitions available.
- [ ] Public exports configured.
- [ ] Project compiles successfully.
- [ ] Development build succeeds.
- [ ] Production build succeeds.
- [ ] Tauri build succeeds.

---

## 10. Definition of Done Checklist

- [ ] Built-in Tools Foundation completed.
- [ ] Module structure follows the approved architecture.
- [ ] Public contracts available.
- [ ] Project validation completed.
- [ ] Changes reviewed.
- [ ] Ready for commit approval.
