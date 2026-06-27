# EOUS Technical Stack
Version: 1.0
Status: Frozen
Owner: EOUS

---

# Purpose
This document defines the official implementation technologies used by the EOUS project.
The selected technology stack serves as the foundation for all future development and should remain stable unless a documented architectural decision explicitly supersedes it.
Technology choices prioritize long-term maintainability, ecosystem maturity, developer productivity, and compatibility with AI-assisted software development.

---

# Selection Principles
Every technology should satisfy the following principles.
* Long-term maintainability.
* Mature ecosystem.
* Strong documentation.
* AI-friendly development.
* High performance.
* Modular architecture.
* Minimal vendor lock-in.
* Future-proof design.

---

# Official Technology Stack

| Layer            | Technology          | Purpose                               |
| ---------------- | ------------------- | ------------------------------------- |
| Desktop Runtime  | Tauri v2            | Native desktop application runtime    |
| Frontend         | React 19            | User interface                        |
| Language         | TypeScript          | Application development               |
| Build Tool       | Vite                | Development server and bundler        |
| Package Manager  | pnpm                | Dependency management                 |
| Styling          | Tailwind CSS v4     | Styling system                        |
| UI Components    | shadcn/ui           | Reusable UI components                |
| Icons            | Lucide React        | Icon library                          |
| Routing          | React Router v7     | Client-side routing                   |
| State Management | Zustand             | Global application state              |
| Server State     | TanStack Query v5   | API and asynchronous state management |
| Validation       | Zod                 | Runtime schema validation             |
| Forms            | React Hook Form     | Form management                       |
| Local Database   | SQLite              | Local persistent storage              |
| ORM              | Drizzle ORM         | Database abstraction                  |
| Logging          | Pino                | Structured logging                    |
| Testing          | Vitest + Playwright | Unit and end-to-end testing           |
| Linting          | ESLint              | Code quality                          |
| Formatting       | Prettier            | Code formatting                       |
| Date & Time      | date-fns            | Date and time utilities               |

---

# Technology Selection Strategy
Technology selection follows these priorities.
1. Stability
2. Maintainability
3. Performance
4. AI Compatibility
5. Ecosystem Maturity
6. Developer Experience

Popularity alone should never determine technology adoption.

---

# Change Policy
The official technology stack should remain stable throughout a major project version.
Technology replacements require:
* Technical evaluation.
* Documented rationale.
* Decision Log update.
* Architecture review.
* Team approval.

---

# Scope
This document defines the implementation technologies adopted by EOUS.
Technology-specific implementation guidelines belong to project planning and development documentation.