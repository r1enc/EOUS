# Git Workflow
Version: 1.0
Status: Frozen
Owner: EOUS

---

# Purpose
This document defines how AI assistants should organize commits and maintain a clean Git history throughout the EOUS project.

---

# References
This document should be used together with:
- docs/00_CONSTITUTION.md
- docs/01_PRD/V1.md
- docs/02_ARCHITECTURE/V1.md

---

# Commit Principles
Every commit should:
* Represent one logical change.
* Be independently understandable.
* Avoid unrelated modifications.
* Keep history easy to navigate.

---

# Commit Strategy
The AI should:
* Complete one task before creating a commit.
* Review changes before committing.
* Separate documentation and implementation whenever practical.
* Avoid combining multiple independent features into a single commit.

---

# Commit Message Format
Use the following format:
```text
type(scope): summary
```

Examples:
```text
docs(sdk): freeze V1 SDK specification
feat(agent): implement execution planner
fix(memory): resolve persistence issue
refactor(provider): simplify provider registry
test(tool): add SDK validation tests
```

---

# Before Commit
Before creating a commit, the AI should verify:
* Build succeeds.
* Lint succeeds.
* Relevant tests pass.
* Documentation is updated when required.
* No unintended files are included.

---

# Prohibited Commits
The AI should never:
- Commit unrelated changes.
- Commit generated temporary files.
- Commit unfinished work as complete.
- Rewrite commit history without approval.

---

# Goal
Maintain a clean, meaningful, and review-friendly Git history.