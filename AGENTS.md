# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Build/Run Commands

```bash
bun run dev          # Vite dev server (port 1420, strict)
bun run build        # TypeScript check + Vite production build
bun run tauri dev    # Full Tauri desktop app in dev mode
bun run lint         # ESLint check
bun run lint:fix     # ESLint auto-fix
bun run typecheck    # tsc --noEmit
./build.sh           # Full production build: lint, tauri build, install to /Applications
```

## Architecture

**Focal** is a Tauri v2 desktop app — a study/project management tool for VCE (Victorian Certificate of Education) students. It organises coursework files, tracks study sessions, and manages grades.

### Backend (Rust — `src-tauri/`)

Files live on disk at `~/Documents/Projects/<project-folder>/`. The Rust layer exposes Tauri commands for filesystem operations:

- `move_files_to_project` — moves (or copies+deletes) files into a project directory
- `get_project_files` / `get_project_file_count` — enumerate files in a project folder
- `create_project_folder` / `create_project_with_subfolders` — create directory structures on disk
- `get_subject_folder_template` — returns subject-specific subfolder lists (duplicated from the frontend `SUBJECT_FOLDER_TEMPLATES` constant; keep both in sync)
- `search_files_all_projects` — recursive filename search across all project directories
- `delete_files` — deletes files or directories

Tauri plugins: `opener`, `fs`, `dialog`, `shell`.

### Frontend (React — `src/`)

Single-page React app with dialog-based routing (no client-side router). The `App` component owns all state and passes it down.

**Data flow:**
- Application data (projects, sessions, grades) is persisted as JSON files in the Tauri app data directory, read/written via `@tauri-apps/plugin-fs` (`readTextFile`, `writeTextFile`)
- UI preferences (dark mode, custom subjects, notified deadlines) use `localStorage`
- File operations go through Tauri `invoke` commands to the Rust backend

**Key hooks (sole source of truth for each domain):**
- `useProjects` — CRUD for projects, persists to `projects.json`
- `useStudySessions` — CRUD for study sessions, persists to `sessions.json`
- `useGrades` — CRUD for grades with weighted score calculation, persists to `grades.json`
- `useProjectFiles` — file listing/adding/deleting via Tauri commands
- `useDeadlineNotifications` — toast notifications for deadlines within 72 hours (once per deadline, tracked in localStorage)

**UI toolkit:** shadcn/ui (Radix primitives) + Tailwind CSS v4 + `lucide-react` icons. The `components.json` uses Radix Nova style. Theme uses CSS variables in OKLCH, with `.dark` class toggle managed in `App` via `useDarkMode`.

**Path alias:** `@/` maps to `src/`.

### Design Context (from `.impeccable.md`)

- Target users: students managing coursework during study sessions. The app should feel fast, minimal, tool-like (not a dashboard).
- Both dark and light modes must feel equally considered.
- Motion should be minimal and purposeful — no decorative animations.
- Accessibility: WCAG AA contrast, focus indicators, reduced-motion support.
- Visual tone: precision tool aesthetic, Muji-meets-drafting-table. Single accent color, used sparingly.

### Type System (`src/lib/types.ts`)

Core domain types: `Project`, `StudySession`, `GradeEntry`, `FileInfo`, `Subject`, and supporting enums (`DeadlineType`, `FileTag`, `Unit`, `StudySessionStatus`, `GradeType`). VCE subjects are predefined in `VCE_SUBJECTS` with IDs, names, short codes, and colors. Users can add custom subjects via the `CustomSubjects` dialog.
