# Review Prompt
Version: 1.0
Status: Frozen 
Owner: EOUS

---

# Purpose
This prompt defines how AI assistants should review completed work before recommending completion.

---

# Review Process
The AI should verify:
* Requested functionality is complete.
* Relevant documentation has been respected.
* Architecture remains consistent.
* SDK rules have been followed where applicable.
* UI/UX requirements have been respected where applicable.
* Coding Standards have been followed.
* Definition of Done has been satisfied.
* Verify Definition of Done.

If issues are identified, the AI should:
* Explain the issue.
* Recommend improvements.
* Avoid approving incomplete implementation.

---

# Goal
Ensure that every implementation is reviewed consistently before delivery or commit.