# Focal

A desktop study organiser for VCE students. Manage coursework files, track study sessions, and monitor grades across subjects — all from a fast, native macOS app.

## Features

- **Project management** — organise coursework by subject, unit, and deadline type (SAC, exam, assignment, GAT)
- **File organisation** — drag and drop files into project folders with automatic directory structure
- **Study timer** — built-in Pomodoro timer (25/5/15 minute cycles) with visual progress ring
- **Grade tracking** — weighted score calculation across SACs, exams, and assignments
- **Deadline notifications** — toast alerts for deadlines within 72 hours
- **Global search** — fuzzy search across projects and study sessions (⌘K)
- **Dark mode** — system-aware with manual toggle, equally polished in both themes
- **Data export** — portable JSON backup of projects, sessions, and grades

## Tech stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Radix primitives)
- **Desktop shell**: Tauri v2 (Rust backend)
- **Data**: JSON files on disk via Tauri FS plugin, localStorage for UI preferences

## Development

```bash
bun install
bun run dev          # Vite dev server on port 1420
bun run tauri dev    # Full Tauri desktop app in dev mode
```

```bash
bun run typecheck    # TypeScript check
bun run lint         # ESLint
bun run lint:fix     # ESLint auto-fix
```

## Production build

```bash
bun run build        # TypeScript check + Vite production build
make build           # Lint-fix, Tauri compile, install to /Applications
```

Available `make` targets: `dev`, `tauri-dev`, `build`, `build-only`, `install`, `lint`, `lint-fix`, `typecheck`, `check`, `clean`, `distclean`, `format`, `release`, `release-dry-run`.

The built `.app` bundle lands in `src-tauri/target/release/bundle/macos/`.

## Project structure

```
src/
  components/       # React components (Sidebar, ProjectDetail, dialogs, ui/)
  hooks/            # Data hooks (useProjects, useStudySessions, useGrades)
  lib/              # Types, utilities, constants
src-tauri/
  src/              # Rust backend — Tauri commands for filesystem ops
```

## Data storage

Application data lives at the Tauri app data directory as JSON files (`projects.json`, `sessions.json`, `grades.json`). Project files are stored in `~/Documents/Projects/<project-folder>/`.
