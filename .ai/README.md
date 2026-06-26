# EOUS AI Development Layer

Version: 1.0
Status: Draft
Owner: EOUS

---

# Purpose

This directory contains the operational guidance used by AI assistants working on the EOUS project.

Unlike the documentation inside the `docs/` directory, the files within `.ai/` do not define the product, architecture, or platform itself.

Instead, they define how an AI assistant should read documentation, make implementation decisions, follow project standards, and contribute consistently throughout the software development lifecycle.

The `.ai` directory serves as the operational layer between the project documentation and AI-assisted implementation.

---

# Source of Truth

The AI must never treat the `.ai` directory as the primary source of project knowledge.

When implementing any feature, the following document priority must always be respected.

1. Constitution
2. Product Requirements (PRD)
3. Architecture
4. SDK
5. UI/UX
6. Roadmap
7. Decisions
8. Backlog

The `.ai` directory only defines how these documents should be interpreted during development.

---

# Working Principles

Every AI assistant workin g on EOUS should follow these principles.

* Read documentation before implementation.
* Never bypass architectural boundaries.
* Never duplicate project documentation.
* Preserve consistency across the entire codebase.
* Prefer maintainability over short-term convenience.
* Explain implementation plans before coding.
* Perform self-review before considering work complete.

---

# AI Development Workflow
Every implementation should follow the same workflow.

```text
Read Context
      │
      ▼
Read Documentation
      │
      ▼
Create Implementation Plan
      │
      ▼
Wait for Approval
      │
      ▼
Implement
      │
      ▼
Self Review
      │
      ▼
Update Documentation
      │
      ▼
Git Commit
```
Skipping workflow stages should be avoided unless explicitly requested by the project owner.

---

# Directory Structure
```text
.ai/
│
├── README.md
│
├── context/
│
├── rules/
│
├── workflows/
│
├── quality/
│
└── prompts/
```
Each directory has a dedicated responsibility and should remain focused on its intended purpose.

---

# Directory Responsibilities

| Directory | Responsibility                                         |
| --------- | ------------------------------------------------------ |
| context   | Provides project context for AI assistants.            |
| rules     | Defines implementation and development rules.          |
| workflows | Defines standard development workflows.                |
| quality   | Defines quality standards and completion criteria.     |
| prompts   | Provides reusable prompts for AI-assisted development. |

---

# General Rules
The AI should never:
* Invent undocumented architecture.
* Ignore project documentation.
* Introduce breaking architectural changes without approval.
* Modify the project philosophy defined by the Constitution.
* Replace existing standards with personal preferences.
Whenever uncertainty exists, the AI should request clarification rather than making assumptions.

---

# Goal
The purpose of the AI Development Layer is to ensure that every AI assistant contributes to EOUS using the same engineering standards, development workflow, and architectural principles regardless of the underlying AI model.
