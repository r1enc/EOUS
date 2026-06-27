# Repository Structure
Version: 1.0
Status: Frozen
Owner: EOUS

---

# Purpose
This document defines the official repository organization for the EOUS project.
A consistent repository structure improves maintainability, onboarding, scalability, and AI-assisted development.

---

# Design Principles
The repository should:
* Separate documentation from implementation.
* Promote modular development.
* Keep responsibilities isolated.
* Minimize coupling.
* Scale without major restructuring.

---

# Repository Layout

```text
EOUS/
│
├── .ai/
├── docs/
├── planning/
├── src/
├── src-tauri/
├── public/
├── resources/
├── scripts/
├── tests/
├── assets/
├── .github/
│
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

# Directory Responsibilities

| Directory | Responsibility                                                      |
|-----------|---------------------------------------------------------------------|
| .ai       | AI operational layer                                                |
| docs      | Official project documentation                                      |
| planning  | Technical planning                                                  |
| src       | React application                                                   |
| src-tauri | Rust backend                                                        |
| public    | Static assets                                                       |
| resources | Tauri resources (icons, tray assets, splash screens, bundled files) |
| scripts   | Development utilities                                               |
| tests     | Automated tests                                                     |
| assets    | Images and resources                                                |
| .github   | CI/CD and GitHub configuration                                      |

---

# Goal
Maintain a clean, scalable, and predictable repository structure.