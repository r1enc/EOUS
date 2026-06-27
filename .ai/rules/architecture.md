# Architecture Rules
Version: 1.0
Status: Frozen
Owner: EOUS

---

# Purpose
This document defines the architectural constraints that every AI assistant must respect when contributing to the EOUS project.
These rules ensure that implementation remains consistent with the official Architecture document and preserves the long-term maintainability of the platform.
This document supplements the Architecture specification but never replaces it.

---

# References
This document should be used together with:
- docs/00_CONSTITUTION.md
- docs/01_PRD/V1.md
- docs/02_ARCHITECTURE/V1.md

---

# General Principles
Every implementation should:
* Respect architectural boundaries.
* Preserve modularity.
* Minimize coupling.
* Maximize maintainability.
* Follow existing architectural patterns.
* Prefer extension over modification.

---

# Mandatory Rules
## AR-001 — Respect the Architecture
Every implementation must follow the official Architecture documentation.
The AI must never invent a new architecture.

---

## AR-002 — Preserve Layer Boundaries
Components must communicate only through their designated architectural layers.
Cross-layer shortcuts are prohibited.

---

## AR-003 — Agent-Oriented Design
The Agent remains the central orchestrator of the platform.
Components must never bypass the Agent unless explicitly defined by the Architecture.

---

## AR-004 — Tool Isolation
Business capabilities belong inside independent tools.
The Agent must never implement tool-specific business logic.

---

## AR-005 — SDK Enforcement
Every tool must execute through the Tool SDK.
Direct tool execution is prohibited.

---

## AR-006 — Provider Independence
The implementation must never depend on a single AI provider.
Provider-specific logic must remain isolated behind the Provider Interface.

---

## AR-007 — Memory Abstraction
Persistent memory must always be accessed through the Memory Interface.
Implementation details must remain hidden from the Agent.

---

## AR-008 — Permission First
Sensitive operations must always pass through the Permission Manager before execution.
Permission validation must never be bypassed.

---

## AR-009 — Stable Core
New features should extend the platform without modifying the architectural core whenever possible.

---

## AR-010 — Documentation Before Change
If an implementation requires architectural changes, the Architecture documentation must be updated and approved before code implementation begins.

---

# AR-011 — No Architectural Assumptions
When architectural information is missing or unclear, the AI must request clarification instead of introducing new architectural decisions.

---

# Decision Guidelines
When multiple implementation approaches are possible, prefer the solution that:
1. Preserves architectural consistency.
2. Minimizes coupling.
3. Maximizes modularity.
4. Improves maintainability.
5. Avoids unnecessary complexity.

---

# Goal
Ensure that every implementation preserves the architectural integrity of EOUS regardless of the AI model performing the work.