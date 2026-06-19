# Focal

A desktop study organiser for VCE students. Manage coursework files, plan study sessions around a configurable timetable, and track your progress across subjects — all from a fast, native desktop app.

## Features

- **Project management** — organise coursework by subject, unit (1–4), and deadline type (SAC, exam, assignment). Each project owns a folder on disk with the subject's default subfolders (SACs / Notes / Past-Papers / Exam-Revision / Resources).
- **Project templates** — save assessment scaffolds with custom icons, subfolders, and checklists to spin up new projects in a click.
- **Checklists & dependencies** — track subtasks per assessment and which assessments block which. Surfaced into the Today view.
- **File organisation** — drag-and-drop files into project folders (or paste `file://` URLs), with bulk tag, move between subfolders, rename, copy paths, select-all, and an undo toast for destructive operations.
- **Customisable Pomodoro timer** — work / break / long-break durations are configurable (default 25 / 5 / 15-minute cycles), full-screen Focus view, recovery dialog on app reopen, overtime study mode, and session reflection with confidence (1–5), blockers, and next-action notes.
- **Timetable** — configurable cycle length (default 10-day VCE rotation), per-day period editing with subjects, locations and breaks, school holidays, weekend support, and manual day override.
- **Calendar** — month/week grid, multi-day events, drag-to-reschedule, batch select/complete/merge/delete, study priorities, prep balance, month brief.
- **Deadline notifications** — within-app toasts plus optional native OS notifications at "due now", "today", "tomorrow", and "soon" (≤72 hours) windows.
- **AI Assessment Copilot** — OpenRouter-powered assistant that drafts focused study sessions for upcoming assessments from your priority and prep balance. Approve, edit, or refine each draft before it lands on the calendar.
- **AI Auto Rename** — proposes consistent, descriptive filenames for dumped files (optionally using file-content snippets as context).
- **Text to Events** — paste a teacher notice or rough plan; the AI extracts draft calendar events you can review and approve.
- **Analytics** — total time, daily average, study streak, study-time trend, subject breakdown, completion rate, efficiency, time-of-day, and consistency heatmap across 7d / 30d / 3mo / 1yr / All.
- **Global search** (⌘K / Ctrl K) — fuzzy search across assessments, sessions, events, and file names; quick actions (new assessment / session / event, jump to Home / Timetable / Analytics).
- **Keyboard shortcuts** throughout — see table below.
- **Theming** — multiple themes, light / dark / system mode (handled equally in both), system zoom levels, custom subjects.
- **Notion sync** — optional two-way sync with a Notion database for events and sessions.
- **Supabase multi-device sync** — optional account-driven sync with conflict handling, push / pull, retry, and realtime updates.
- **Data export** — portable JSON backup of projects, sessions, events, templates, and settings.

## Tech stack

- **Frontend**: React 19 + TypeScript (strict), Tailwind CSS v4 (`@tailwindcss/vite`), Radix primitives (`radix-ui`), Recharts, Framer Motion, Sonner toasts, `lucide-react` icons, `react-day-picker`, `date-fns`, React Router-free SPA driven by `App.tsx`.
- **Desktop shell**: Tauri v2 (Rust backend). Plugins: `fs` (with watcher), `dialog`, `notification`, `opener`, `shell`, `os`.
- **Styling & fonts**: heading font is **Sora Variable** (`@fontsource-variable/sora`); UI font is **Geist**, both registered through the Tailwind v4 `@theme` tokens.
- **AI**: OpenRouter Chat Completions with structured `json_schema` output (Assessment Copilot, Auto Rename, Text-to-Events).
- **Cloud sync**: optional Supabase Auth + Postgres + Realtime, with a custom sync engine (queue, conflict resolution, device tracking). Notion remains a separate optional calendar integration.

## Development

```bash
bun install
bun run dev          # Vite dev server on port 1420
bun run tauri dev    # Full Tauri desktop app in dev mode
```

```bash
bun run typecheck    # TypeScript check (tsc --noEmit)
bun run lint         # ESLint
bun run lint:fix     # ESLint auto-fix
```

Self-checks live under `scripts/` (e.g. `bun scripts/check-timetable-reorder.ts`, `bun scripts/sync-self-check.ts`).

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| ⌘K / Ctrl K | Global search |
| ⌘N / Ctrl N | New assessment |
| ⌘⇧N | New calendar event |
| ⌘⇧S | New study session |
| ⌘+ / ⌘− / ⌘0 | Zoom in / out / reset |
| H | Go to Home (Today) |
| T | Go to Timetable |
| A | Go to Analytics |
| `[` | Toggle sidebar (outside input fields) |
| 1–7 | Jump to Settings sections |

Single-key shortcuts (H / T / A / `[` / `/`) fire only when no input has focus.

## Supabase sync setup

Focal works locally without signing in. To enable multi-device sync:

1. Create a Supabase project.
2. Run `supabase/migrations/0001_initial_sync.sql` in the Supabase SQL editor or through the Supabase CLI.
3. Copy `.env.example` to `.env` and set:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

4. Confirm the sync tables are in the `supabase_realtime` publication. The migration includes the `alter publication supabase_realtime add table ...` statements.
5. Run the app with `bun run dev` or `bun run tauri dev`, then sign in from Settings → Account.

Do not put a Supabase service-role or secret key in `.env`; the desktop client only uses the publishable key. Supabase is the app-owned sync layer. Notion sync remains optional and mirrors local Focal events/sessions only when configured.

## Notion sync setup

Settings → Notion Sync accepts a Notion integration token and the data source id. The schema is fetched on demand; pull syncs local events/sessions, and edits made in Focal can be pushed back to the configured database.

## Production build

```bash
bun run build        # TypeScript check + Vite production build
make build           # Lint-fix, version bump, Tauri compile, install to /Applications (macOS)
```

`make` targets: `dev`, `tauri-dev`, `build`, `build-only`, `install`, `lint`, `lint-fix`, `typecheck`, `check`, `clean`, `distclean`, `format`, `bump-version`, `release`, `release-dry-run`.

The built `.app` bundle lands in `src-tauri/target/release/bundle/macos/`.

## Project structure

```
src/
  components/
    analytics/         # Charts (trend, breakdown, completion, efficiency, heatmap, time-of-day)
    home/              # Today calendar grid, day detail, prep balance, study priorities, quick links, recent activity, month brief
    project/           # File tree, breadcrumbs, checklist panel, dependencies panel, session list, project actions
    settings/          # Account, appearance, subjects, Notion sync, AI model, auto-rename, data sections
    timetable/         # Cycle editor, period popover, inline day edit
    timer/             # Focus view, controls, subject picker, duration inputs, recovery dialog
    ui/                # Local shadcn-style primitives (button, card, dialog, popover, select, ...)
  hooks/               # useProjects, useStudySessions, useEvents, useKeyboardShortcuts, useSupabaseAuth, useSupabaseSync, useNotionSync, useProjectFiles, useProjectsDirectoryWatcher, useDeadlineNotifications, useAssessmentForm
  lib/
    notion/            # pull, push, schema, subjectMatch
    supabase/          # client, auth
    sync/              # engine, queue, realtime, device, mappers, types
    hooks/             # useLatestRef, usePersistedData
    analytics, planning, studyPriority, themes, settings, motion, chartTheme, fileMetadata, pomodoro, copilot, autoRename, groupSessions, undoToast, confirmToast, ...
src-tauri/
  src/commands/        # Rust handlers: files (move/scan/rename/import), notion (query/schema/create/update/delete), credits, window
  src/lib.rs           # Tauri builder + invoke_handler registry
```

## Data storage

- **Project folders** live at `~/Documents/Projects/<project-name>/` by default — changeable via Settings → Data (any local directory works). The folder tree is watched, so external edits appear live in the file pane.
- **App state JSON** (`projects.json`, `events.json`, `sessions.json`) sits in the Tauri `appDataDir` and is the source of truth for project data — there is no localStorage mirror, the UI reads from disk on load. The Supabase sync engine separately keeps a `sync-queue.json` plus its dirty-table state in `localStorage` for offline replay and conflict resolution.
- **UI preferences** — theme, mode, zoom, custom subjects, hidden subjects, timetable config, Pomodoro settings — live in `localStorage` per browser profile.
- **Settings → Account** drives sign-in and the multi-device sync engine. **Settings → Data** for export and projects-root management.

## Assessment types

Focal implements three assessment deadline types: `sac`, `exam`, and `assignment`. Calendar events extend this with `homework`, `event`, `other`, and `practice-sac`. There is no built-in "GAT" type — extend `DeadlineType` in `src/lib/types.ts` if your school needs one.
