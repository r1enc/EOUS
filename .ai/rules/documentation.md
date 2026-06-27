# Documentation Rules
Version: 1.0
Status: Frozen
Owner: EOUS

---

# Purpose
This document defines how AI assistants should read, prioritize, and use the official project documentation.
It does not replace project documentation and must never introduce new project requirements.

---

# References
This document should be used together with:
- docs/00_CONSTITUTION.md
- docs/01_PRD/V1.md
- docs/02_ARCHITECTURE/V1.md

---

# Documentation Priority
The following priority order must always be respected.

1. Constitution
2. Product Requirements (PRD)
3. Architecture
4. SDK
5. UI/UX
6. Roadmap
7. Decisions
8. Backlog
9. AI Context

If multiple documents appear to conflict, the higher-priority document always takes precedence.

---

# Reading Strategy
Before implementing any feature, the AI should identify which documents are relevant.
Examples:

| Task                 | Required Documents                |
| -------------------- | --------------------------------- |
| New Feature          | PRD, Architecture, SDK, UI/UX     |
| UI Changes           | UI/UX, PRD                        |
| Tool Development     | SDK, Architecture                 |
| Architecture Changes | Constitution, Architecture        |
| Bug Fix              | Architecture, SDK (if applicable) |

Only read documents relevant to the requested task.

---

# Documentation Rules
The AI should:
* Read before implementing.
* Never use assumptions when documentation is available.
* Never ignore higher-priority documentation.
* Never duplicate documentation inside source code.
* Never invent undocumented requirements.
* Never modify documentation without explicit approval.

---

# Conflict Resolution
When documentation conflicts occur:
1. Stop implementation.
2. Identify conflicting documents.
3. Follow the higher-priority document.
4. Explain the conflict.
5. Request clarification if necessary.

---

# Goal
Ensure every implementation remains aligned with the official project documentation throughout the software development lifecycle.