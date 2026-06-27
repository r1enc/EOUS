# Bug Fix Workflow
Version: 1.0
Status: Frozen
Owner: EOUS

---

# Purpose
This document defines how AI assistants should investigate, resolve, and verify software defects within the EOUS project.

---

# Workflow
```text
Identify Issue
      │
      ▼
Reproduce Issue
      │
      ▼
Understand Root Cause
      │
      ▼
Read Relevant Documentation
      │
      ▼
Propose Fix
      │
      ▼
Wait for Approval
      │
      ▼
Implement
      │
      ▼
Verify Fix
      │
      ▼
Self Review
      │
      ▼
Commit
```

---

# Rules
The AI should:
* Fix the root cause instead of symptoms.
* Avoid introducing unrelated changes.
* Preserve existing architecture.
* Verify that the original issue is resolved.
* Ensure no new issues are introduced.

---

# Goal
Produce reliable fixes while preserving platform stability.