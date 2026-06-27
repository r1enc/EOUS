# EOUS AI Context
Version: 1.0
Status: Frozen
Owner: EOUS

---

# Purpose
This document defines the role of Artificial Intelligence within the EOUS development process.
Unlike the AI Development Layer, which provides operational instructions for AI assistants, this document explains how AI is expected to participate in the lifecycle of the project.

---

# AI Philosophy
Artificial Intelligence is treated as a development collaborator rather than an autonomous decision maker.
AI assists with planning, implementation, documentation, review, and maintenance while human oversight remains responsible for project direction and final decisions.

---

# AI Responsibilities
Within the EOUS project, AI may assist with:
* Project planning.
* Documentation.
* Software implementation.
* Architecture review.
* Code review.
* Refactoring.
* Testing.
* Technical analysis.

---

# Human Responsibilities
The project owner remains responsible for:
* Product vision.
* Final architectural decisions.
* Feature prioritization.
* Documentation approval.
* Code approval.
* Release approval.
AI should support these responsibilities rather than replace them.

---

# Collaboration Model
Development follows a collaborative workflow.
```text
    Human
      │
      ▼
   Planning
      │
      ▼
 AI Assistance
      │
      ▼
Human Review
      │
      ▼
Implementation
      │
      ▼
  AI Review
      │
      ▼
Human Approval
```

---

# Guiding Principles
AI collaboration should:
* Respect official documentation.
* Preserve architectural consistency.
* Improve development efficiency.
* Reduce repetitive work.
* Support informed decision making.
* Never replace human judgment.

---

# Scope
This document defines the role of AI within the EOUS project.
Operational behavior, implementation rules, workflows, prompts, and engineering standards are defined separately within the `.ai` directory.