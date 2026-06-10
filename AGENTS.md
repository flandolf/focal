# Repository Guidelines

## Project Overview

**Focal** is a Tauri v2 desktop app for VCE (Victorian Certificate of Education) students. It organises coursework files, tracks study sessions, manages grades, and integrates with Notion calendars. Target platform is macOS.

**Design ethos** (from `.impeccable.md`): precision tool aesthetic (Muji-meets-drafting-table). Fast, minimal, utilitarian — not a dashboard, not gamified. Single accent color (blue), used sparingly. Both dark and light modes equally considered. Motion must be minimal and purposeful. WCAG AA contrast, focus indicators, reduced-motion support, text zoomable to 200%.

## Architecture & Data Flow

### Frontend (React 19 + TypeScript)

Single-page React app with dialog-based routing — **no client-side router**. The `App` component (`src/App.tsx`, ~52KB) owns all state and uses boolean flags + `selectedId` to control views (`homeSelected`, `settingsView`, `analyticsView`, `timetableView`).

**State management pattern:** Each data domain has its own hook — the sole source of truth. Hooks provide CRUD operations and persist to JSON files in Tauri's `appDataDir` via `@tauri-apps/plugin-fs` (`readTextFile` / `writeTextFile`).

| Hook | File | Persists To |
|------|------|-------------|
| `useProjects` | `src/hooks/useProjects.ts` | `appDataDir/projects.json` |
| `useStudySessions` | `src/hooks/useStudySessions.ts` | `appDataDir/sessions.json` |
| `useEvents` | `src/hooks/useEvents.ts` | `appDataDir/events.json` |
| `useProjectFiles` | `src/hooks/useProjectFiles.ts` | Rust backend commands |
| `useNotionSync` | `src/hooks/useNotionSync.ts` | Orchestrates lib/notion/ |
| `useDeadlineNotifications` | `src/hooks/useDeadlineNotifications.ts` | `localStorage` (rate-limited toasts + native) |
| `useKeyboardShortcuts` | `src/hooks/useKeyboardShortcuts.ts` | — |

**Settings/preferences** live in `localStorage`, accessed via functions in `src/lib/settings.ts` (API keys, model selection, Notion calendar, timetable config, auto-rename flags).

**Theming** (`src/lib/themes.ts`): 6 themes × 3 modes (light/dark/system). Persisted to `localStorage`. The `useTheme` hook returns `theme`, `mode`, `resolvedDark`, `setTheme`, `setMode`. CSS variables in OKLCH with `.dark` class toggle.

### Backend (Rust — `src-tauri/`)

Tauri v2 with 5 plugins: `notification`, `opener`, `fs`, `dialog`, `shell`. 18 commands registered in `src-tauri/src/lib.rs`.

**Command modules:**

- **`commands/files.rs`** (12 commands): Project file CRUD. Rooted at `$HOME/Documents/Projects/`. Path-scoped to prevent directory traversal. Synchronous `std::fs` calls. Includes `search_files_all_projects` (case-insensitive filename substring), `import_folder_to_project` (recursive copy with dedup naming), `get_file_content_previews` (binary-safe, whitelist of ~40 text-like extensions, truncated at 200–4000 chars).
- **`commands/notion.rs`** (5 async commands): Notion REST API v1 wrapper. Uses static `LazyLock<reqwest::Client>` with 30s timeout. Cursor-based pagination, full block replacement on page updates. Error responses: `{ data, error: { code, message } }`.
- **`commands/credits.rs`** (1 async command): OpenRouter credit balance check via `GET /api/v1/credits`.

**Capabilities** (`src-tauri/capabilities/default.json`): Filesystem restricted to `$APPDATA`, opener to `$HOME/Documents/Projects/**`, plus notifications, dialogs, shell.

## Key Directories

```
src/                  # React frontend
  App.tsx             # Root component — all state, view routing, dialog management
  main.tsx            # Entry point — mounts App into #root with StrictMode
  components/         # UI components (shadcn/ui dialogs, forms, views)
  hooks/              # Data hooks — sole sources of truth per domain
  lib/                # Utilities, types, themes, motion tokens
    types.ts          # Core domain types and enums
    utils.ts          # cn(), generateId(), date/format helpers
    themes.ts         # Theme system (6 themes × 3 modes)
    settings.ts       # localStorage-backed settings
    motion.ts         # Framer Motion tokens and variants
    analytics.ts      # Analytics computations
    copilot.ts        # AI assessment copilot logic
    timetable.ts      # Timetable generation and scheduling
    assessmentOptions.ts  # Assessment type metadata
    chartTheme.ts     # Recharts chart theming
    notion/           # Notion integration (pull, push, schema, API, subject matching)
src-tauri/            # Rust/Tauri backend
  src/
    lib.rs            # Tauri builder — plugin registration, command registration
    main.rs           # Binary entry point
    commands/         # Tauri command handlers
      files.rs        # Filesystem operations (12 commands)
      notion.rs       # Notion API integration (5 commands)
      credits.rs      # OpenRouter credits (1 command)
  Cargo.toml          # Rust dependencies
  tauri.conf.json     # Tauri app config (window, bundle, CSP)
  capabilities/       # Permission declarations
```

## Development Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Vite dev server (port 1420, strict) |
| `bun run build` | TypeScript check (`tsc`) + Vite production build |
| `bun run tauri dev` | Full Tauri desktop app in dev mode |
| `bun run lint` | ESLint check |
| `bun run lint:fix` | ESLint auto-fix |
| `bun run typecheck` | `tsc --noEmit` |
| `make check` | CI gate: `lint` + `typecheck` |
| `make build` | `lint:fix` + `tauri build` + install to `/Applications` |
| `make release VERSION=x.y.z` | Tagged release build |

Vite config (`vite.config.ts`): `@/` alias → `src/`, manual chunk splitting (vendor-charts, vendor-motion, vendor-radix, vendor-dates, vendor-icons, vendor-react, vendor). Server port 1420, HMR port 1421 when `TAURI_DEV_HOST` is set.

## Code Conventions & Common Patterns

### TypeScript

- **Path alias**: `@/` maps to `src/` (e.g. `import { cn } from '@/lib/utils'`).
- **Strict mode** enabled. `noUnusedLocals`/`noUnusedParameters` disabled. ES2020 target, `react-jsx` JSX transform.
- **Type imports**: ESLint enforces `consistent-type-imports` — use `import type { ... }` for types.
- **Nullish/prefer-optional**: ESLint enforces `prefer-optional-chain` and `prefer-nullish-coalescing`.

### React Components

- All components are functional with hooks. No class components.
- **Dialog pattern**: Create/edit flows use shadcn/ui `Dialog` components. `App.tsx` manages `open` state and passes `onOpenChange` handlers.
- **`cn()` utility** (`src/lib/utils.ts`): `clsx` + `tailwind-merge` for conditional class merging. Used everywhere for className props.
- **`generateId()`** (`src/lib/utils.ts`): Client-side ID generation for domain objects (no server-side IDs).
- **Component file naming**: PascalCase `.tsx` files. One component per file (plus potentially small helper sub-components).

### Hooks Pattern

Each data hook follows the same pattern:
1. State via `useState<T[]>()` with a ref for stale-closure safety (`useRef(state)`)
2. Load on mount via `useEffect` reading from Tauri FS plugin (`readTextFile` → `JSON.parse`)
3. Persist on every mutation via `writeTextFile` (with `BaseDirectory.AppData`)
4. Expose CRUD operations (add, update, delete) + batch variants + restore (undo)
5. For Notion-synced domains, expose `syncSessions`/`syncEvents` and `notionEnabled` flag

### Styling

- **Tailwind CSS v4** (CSS-first config — no `tailwind.config.*` file). Configuration in `src/index.css` via `@theme` blocks.
- **CSS variables** in OKLCH for theming. Dark mode via `.dark` class on `<html>`.
- **shadcn/ui** (Radix Nova style) with `neutral` base color. Components in `src/components/ui/`.
- **Icons**: `lucide-react` exclusively.

### Motion

- **Framer Motion** with manual chunk splitting (`vendor-motion`).
- Motion tokens in `src/lib/motion.ts`: `MOTION_EASE`, `MOTION_DURATION`, `TRANSITION` presets, `REDUCED_TRANSITION` for `prefers-reduced-motion`.
- Reusable variants: `staggerContainer`, `staggerItem`, `slideInRight`, `scaleIn`, `popIn`.
- Interactive helpers: `pressable`, `hoverLift`, `nudge`. Use `whileTap={{ scale: 0.97 }}` for press feedback on interactive elements.

### Data Persistence

- **Application data**: JSON files in Tauri app data directory via `@tauri-apps/plugin-fs`. Files: `projects.json`, `sessions.json`, `events.json`.
- **User files**: `~/Documents/Projects/<project-folder>/` managed by Rust backend.
- **Preferences**: `localStorage` (theme, settings, notification state, UI preferences).
- **File metadata** (tags, favorites): `fileMetadata.json` in `appDataDir` via `src/lib/fileMetadata.ts`.

## Important Files

| File | Role |
|------|------|
| `src/App.tsx` | Root component — all view routing, dialog state, CRUD handlers, shortcuts, theme, Notion sync |
| `src/main.tsx` | Entry point — `React.StrictMode` + `<App />` |
| `src/lib/types.ts` | Core types (`Project`, `StudySession`, `CalendarEvent`, `Subject`, `FileInfo`, `TimetableEntry`) and enums |
| `src/lib/utils.ts` | Shared utilities (`cn`, `generateId`, date/time helpers, formatting) |
| `src/lib/themes.ts` | Theme system and `useTheme` hook |
| `src/lib/settings.ts` | All `localStorage`-backed settings |
| `src/lib/motion.ts` | Framer Motion tokens, variants, reduced-motion support |
| `src/index.css` | Tailwind v4 config, CSS variables, base styles |
| `src-tauri/src/lib.rs` | Tauri plugin + command registration |
| `src-tauri/src/commands/files.rs` | All project filesystem commands |
| `src-tauri/src/commands/notion.rs` | Notion API integration |
| `src-tauri/Cargo.toml` | Rust dependency manifest |
| `src-tauri/tauri.conf.json` | Tauri window, bundle, CSP, dev/build commands |
| `package.json` | Scripts, frontend dependencies |
| `vite.config.ts` | Vite config (aliases, chunk splitting, server) |
| `tsconfig.json` | TypeScript config (strict, bundler resolution, path aliases) |
| `eslint.config.js` | ESLint flat config (typescript-eslint, react-hooks, react-refresh) |
| `Makefile` | Convenience wrappers for build, check, release |
| `components.json` | shadcn/ui configuration |

## Runtime/Tooling Preferences

- **Runtime**: Bun (package manager, script runner, dev server). Node.js not used directly.
- **Package manager**: Bun (`bun.lock` lockfile).
- **Bundler**: Vite 8 with rolldown (not Rollup).
- **TypeScript**: v6 with bundler-mode module resolution.
- **CSS**: Tailwind CSS v4 (CSS-first configuration). No `tailwind.config.*` file.
- **Linter**: ESLint v10 flat config with typescript-eslint.
- **CI**: `make check` (lint + typecheck).

## Testing & QA

- **No test framework is currently configured.** There are no test files, no `vitest`/`jest` configuration, and no test scripts in `package.json`.
- **Linting** (`bun run lint`) and **typechecking** (`bun run typecheck`) serve as the primary quality gates.
- The project uses `React.StrictMode` in development for double-render detection.
