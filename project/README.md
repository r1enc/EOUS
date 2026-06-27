# Project Development
Version: 1.0
Status: Draft
Owner: EOUS

---

# Purpose
This directory manages the active development of the EOUS project.
Unlike the `docs` directory, which defines the project's official specifications, and the `planning` directory, which defines long-term implementation planning, this directory contains the current development artifacts used throughout implementation.

---

# Development Hierarchy
All implementation should follow the same hierarchy.

```text
   Roadmap
      │
      ▼
   Planning
      │
      ▼
    Epic
      │
      ▼
   Feature
      │
      ▼
    Task
      │
      ▼
Implementation
```

---

# Directory Structure

```text
project/
│
├── README.md
├── epics/
├── features/
├── tasks/
└── releases/
```

---

# Directory Responsibilities

| Directory | Responsibility                        |
| --------- | ------------------------------------- |
| epics     | Major implementation objectives       |
| features  | Functional decomposition of each Epic |
| tasks     | Executable implementation work        |
| releases  | Release planning and release notes    |

---

# Development Workflow
Every implementation should follow this sequence.
```text
    Epic
      │
      ▼
   Feature
      │
      ▼
    Task
      │
      ▼
Implementation
      │
      ▼
    Review
      │
      ▼
    Commit
```

Tasks should always satisfy the Definition of Done before being committed.

---

# Relationship with Other Directories

| Directory | Responsibility                    |
| --------- | --------------------------------- |
| docs      | Official project documentation    |
| .ai       | AI operational layer              |
| planning  | Long-term implementation planning |
| project   | Active development management     |
| src       | Application source code           |

---

# Change Policy
This directory is expected to evolve throughout the development lifecycle.
Planning documents should remain stable, while project documents may be updated as implementation progresses.

---

# Goal
Provide a structured, traceable, and scalable workflow for implementing EOUS while preserving consistency with the project's official documentation and development standards.