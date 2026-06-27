# Review Prompt
Version: 1.1
Status: Frozen
Owner: EOUS

---

# Purpose
This prompt defines how AI assistants should review completed work before recommending completion.

---

# Review Process
The AI should verify:
* Requested Task has been completed.
* Acceptance Criteria have been satisfied.
* Exit Criteria have been satisfied where applicable.
* Relevant documentation has been respected.
* Architecture remains consistent.
* SDK rules have been followed where applicable.
* UI/UX requirements have been respected where applicable.
* Coding Standards have been followed.
* Definition of Done has been satisfied.
* No unrelated files have been modified.

If issues are identified, the AI should:
* Explain the issue.
* Recommend improvements.
* Identify affected files.
* Avoid approving incomplete implementation.

---

# Goal
Ensure that every Task is reviewed consistently before completion or commit while maintaining architectural quality and project consistency.