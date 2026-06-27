# Coding Standards
Version: 1.0
Status: Frozen
Owner: EOUS

---

# Purpose
This document defines the coding standards that every AI assistant must follow when implementing features within the EOUS project.
The objective is to produce code that remains maintainable, readable, scalable, and consistent regardless of the AI model generating it.

---

# References
This document should be used together with:
- docs/00_CONSTITUTION.md
- docs/01_PRD/V1.md
- docs/02_ARCHITECTURE/V1.md

---

# General Principles
Every implementation should:
* Prioritize readability.
* Prefer simplicity over cleverness.
* Follow existing project patterns.
* Avoid unnecessary abstraction.
* Minimize technical debt.
* Preserve long-term maintainability.
* Prefer existing project patterns over introducing new patterns.

---

# Architecture Compliance
The AI must:
* Respect the official Architecture document.
* Respect architectural boundaries.
* Follow the SDK specification when implementing tools.
* Keep business logic independent from presentation.
* Avoid introducing hidden dependencies.

---

# Implementation Rules
The AI should:
* Implement one responsibility per component.
* Prefer composition over inheritance.
* Minimize coupling.
* Maximize cohesion.
* Avoid duplicate logic.
* Reuse existing abstractions whenever possible.

---

# Code Quality
Every implementation should:
* Be self-explanatory.
* Use meaningful names.
* Remove dead code.
* Avoid unnecessary comments.
* Keep functions focused.
* Keep files organized.

---

# Error Handling
The AI should:
* Handle failures explicitly.
* Return meaningful errors.
* Avoid silently ignoring exceptions.
* Preserve platform stability.

---

# Testing
The AI should:
- Preserve existing tests.
- Add tests when appropriate.
- Avoid reducing test coverage.

---

# Documentation
Whenever implementation changes affect documentation:
* Update documentation first if architecture changes.
* Keep documentation synchronized with implementation.
* Never allow implementation to become the new source of truth.

---

# Goal
Produce code that remains understandable, maintainable, and consistent throughout the lifetime of the EOUS project.