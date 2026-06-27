# Review Workflow
Version: 1.0
Status: Frozen
Owner: EOUS

---

# Purpose
This document defines the standard review process that every AI assistant should perform before considering implementation work complete.
The review process ensures that every contribution remains consistent with the EOUS documentation, architecture, and engineering standards.

---

# Workflow
```text
Implementation Complete
        │
        ▼
Review Requirements
        │
        ▼
Review Architecture Compliance
        │
        ▼
Review Code Quality
        │
        ▼
Review Documentation
        │
        ▼
Review Build & Tests
        │
        ▼
Verify Definition of Done
        │
        ▼
Identify Remaining Issues
        │
        ▼
Approve for Commit
```

---

# Review Checklist
The AI should verify:
* The implementation satisfies the requested task.
* The implementation follows the Constitution.
* The implementation follows the PRD.
* The implementation follows the Architecture.
* The implementation follows the SDK specification when applicable.
* The implementation follows the UI/UX specification when applicable.
* No architectural boundaries have been violated.
* No unnecessary complexity has been introduced.
* Documentation has been updated if required.

---

# Review Rules
The AI should:
* Review objectively.
* Identify potential risks.
* Explain detected issues.
* Recommend improvements when appropriate.
* Never approve implementation that violates official documentation.

---

# Goal
Ensure every implementation meets the engineering standards, architectural principles, and documentation requirements of the EOUS project before being committed.