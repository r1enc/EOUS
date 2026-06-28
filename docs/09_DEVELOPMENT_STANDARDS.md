# EOUS Development Standards

Version: 1.0
Status: Frozen
Owner: EOUS

---

# Purpose

This document defines the official development standards used throughout the EOUS project.

These standards establish a consistent approach for repository organization, source code structure, naming conventions, documentation, and development practices.

Unlike the AI Development Layer (`.ai`), which defines how AI assistants should contribute to the project, this document defines the repository-wide standards that apply to every contributor.

---

# Scope

These standards apply to:

- Repository organization
- Source code organization
- Naming conventions
- Import conventions
- TypeScript conventions
- Documentation conventions
- Development workflow

These standards do not replace the Constitution, PRD, Architecture, SDK, or AI Development Layer.

---

# References

This document should be used together with:

- docs/00_EOUS_CONSTITUTION.md
- docs/02_ARCHITECTURE/ARCHITECTURE.md
- planning/02_REPOSITORY_STRUCTURE.md
- .ai/rules/coding.md
- .ai/rules/documentation.md
- .ai/rules/git.md

---

# General Principles

Development should:

- Preserve architectural consistency.
- Follow the official documentation hierarchy.
- Prioritize readability.
- Prefer maintainability over convenience.
- Minimize unnecessary complexity.
- Extend existing patterns instead of introducing new ones.

---

# Repository Standards

## Folder Convention

The repository should follow the official repository structure.

Project directories should remain focused on a single responsibility.

Examples include:

- docs
- planning
- project
- src
- src-tauri
- tests
- scripts
- resources
- assets

New top-level directories should only be introduced when clearly justified.

---

## Source Code Organization

Source code should be organized according to the official Architecture.

Business logic should remain separated from presentation.

Components should remain cohesive and focused on a single responsibility.

Avoid unnecessary nesting.

---

## File Naming Convention

Use consistent naming throughout the repository.

Recommended conventions:

| Resource | Convention |
|----------|------------|
| React Components | PascalCase |
| Hooks | camelCase |
| Utilities | camelCase |
| Constants | camelCase |
| CSS Files | kebab-case |
| Markdown Documents | UPPER_SNAKE_CASE |

Naming should prioritize clarity over brevity.

---

## Import Convention

Imports should:

- Prefer local project conventions.
- Avoid unnecessary deep relative imports.
- Group imports logically.
- Remove unused imports.
- Maintain consistent ordering.

---

# TypeScript Standards

TypeScript should:

- Use strict type checking.
- Prefer explicit typing when appropriate.
- Avoid unnecessary use of `any`.
- Keep types reusable.
- Prefer composition over inheritance.

Project-wide TypeScript configuration should remain consistent.

---

# Documentation Standards

Documentation should:

- Remain synchronized with implementation.
- Preserve the documentation hierarchy.
- Avoid duplicated information.
- Clearly define ownership and scope.
- Be updated whenever implementation changes require it.

Documentation remains the primary source of truth.

---

# Git Standards

Development should follow the official Git Workflow.

Commits should:

- Represent one logical change.
- Remain independently reviewable.
- Avoid unrelated modifications.

Commit message format:

```text
type(scope): summary
```

Refer to the official Git Workflow for detailed guidance.

---

# Development Workflow

Implementation should follow the standard engineering workflow:

```text
Planning
      │
      ▼
Review
      │
      ▼
Implementation
      │
      ▼
Validation
      │
      ▼
Review
      │
      ▼
Commit
```

Implementation should not bypass any required review stage.

---

# Exceptions

When implementation requires deviations from these standards:

- Document the reason.
- Obtain approval where required.
- Update the relevant documentation before implementation when applicable.

---

# Goal

Provide a consistent development standard that enables both developers and AI assistants to contribute using the same engineering principles while preserving the long-term maintainability of EOUS.