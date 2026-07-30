# Design QA — priority-led Today redesign

## Evidence

- Source visual truth: `/Users/andy/.codex/generated_images/019fb2e5-dd82-71f3-81be-f7c5f0f58198/exec-49f68548-08ee-44ca-9977-ebb94ac97983.png`
- Final native Today capture: `/Users/andy/Projects/focal/.audit/2026-07-30/implementation-final-today.jpeg`
- Final native priorities-open capture: `/Users/andy/Projects/focal/.audit/2026-07-30/implementation-final-priorities-open.jpeg`
- Full side-by-side comparison: `/Users/andy/Projects/focal/.audit/2026-07-30/qa-comparison-final.png`
- Viewport: approximately 1229 x 768 px in the native Tauri window.
- Source pixels: 1586 x 992, normalized to 1229 x 768 for the comparison. The native screenshot is 1229 x 768; device density was not directly reported.
- State: dark mode, Today, July 2026, Thursday 30 July selected, focus priorities open.
- The full priorities-open comparison is legible at original detail, so a separate focused crop was not needed.

## Findings

- No actionable P0, P1, or P2 differences remain.
- Information architecture: Today, Plan, Library, and Review now form a compact primary rail. Library discloses the existing project tree on demand instead of permanently competing with the calendar.
- Calendar fidelity: the month calendar remains the dominant surface, with a selected-day inspector and today's timetable kept in the right rail.
- Priority workflow: the final UI uses a shadcn Popover, Buttons, and Checkboxes to rank all active subjects and pin upcoming events. The list is intentionally longer than the concept image because it reflects the user's real data.
- Action hierarchy: the global `+ New` control owns creation; Today exposes one `Tools` menu, one `Priorities` control, and one primary `Start focus` action.
- Typography and tokens: the implementation keeps Focal's existing Geist/Sora typography, dark semantic tokens, Lucide icons, and established desktop density.
- Accessibility: priority controls have named actions, subject order can be changed without drag-only interaction, event selection does not rely on color, and new interactive targets use the existing shadcn focus behavior.
- Expected P3 deviation: `Next focus` spans the full content width while the concept confines it to the calendar column. The broader treatment is intentional because it preserves the current app shell and gives the main recommendation a single, unambiguous hierarchy.

## Comparison history

1. Pass 1 found a P2 hierarchy issue: the permanent project tree and secondary dashboard modules competed with the month calendar. The fix introduced the compact Library disclosure, removed duplicate month/prep summaries from the visible Today layout, and kept selected-day detail in the right rail.
2. Pass 2 found P2 action duplication across the title bar and Today header. The fix retained the global `+ New` creation menu and consolidated secondary Today actions into one `Tools` dropdown.
3. The post-fix native capture and normalized side-by-side comparison show no remaining P0/P1/P2 differences.

## Interaction and runtime checks

- Reordered subject priorities and confirmed the next-focus reason updates.
- Pinned and unpinned an upcoming event and confirmed it immediately influences the queue.
- Started focus from the recommendation and confirmed subject, project, and focus outcome are prefilled.
- Opened New Assessment and verified assessment type and due-date controls.
- Verified Plan exposes unscheduled next actions before the timetable.
- Verified Review leads with corrective decisions before analytics.
- Verified project workspaces expose readiness, next action, Plan, and Start focus.
- Verified Settings removes the competing outer navigation rail.
- `bun run check`, `bun run test:logic`, and `bun run build` pass.

final result: passed
