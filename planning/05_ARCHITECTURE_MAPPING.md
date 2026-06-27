# Architecture Mapping
Version: 1.0
Status: Frozen
Owner: EOUS

---

# Purpose
This document maps the conceptual architecture defined in the Architecture document to the actual implementation structure.

---

# Mapping

| Architecture Layer   | Implementation                             |
| -------------------- | ------------------------------------------ |
| Presentation Layer   | React Components + shadcn/ui               |
| Agent Layer          | Agent Core Services                        |
| Context Layer        | Context Manager                            |
| Execution Layer      | Execution Engine                           |
| Capability Layer     | Tool SDK Runtime                           |
| Infrastructure Layer | Tauri Backend + SQLite + AI Provider Layer |

---

# Goal
Bridge the gap between architecture and implementation while preserving architectural consistency.