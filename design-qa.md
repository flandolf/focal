# Design QA — HomeView completed events

## Evidence

- Source visual truth: `/Users/andy/.codex/generated_images/019fadbe-13d1-7cd2-856f-fde16c9e5aaf/exec-2630e71f-ae94-4f0b-8671-fdb1eea57708.png`
- Focused source crop: `/Users/andy/.codex/visualizations/2026/07/29/019fadbe-13d1-7cd2-856f-fde16c9e5aaf/focal-option3-source-crop.png`
- Browser-rendered implementation: `/Users/andy/.codex/visualizations/2026/07/29/019fadbe-13d1-7cd2-856f-fde16c9e5aaf/focal-completed-option3-implementation.jpg`
- Full rendered state: `/Users/andy/.codex/visualizations/2026/07/29/019fadbe-13d1-7cd2-856f-fde16c9e5aaf/focal-home-full.jpg`
- Combined visual comparison: `/Users/andy/.codex/visualizations/2026/07/29/019fadbe-13d1-7cd2-856f-fde16c9e5aaf/focal-option3-comparison.jpg`
- Viewport: 983 × 500 CSS px at device scale factor 1.
- Source pixels: 1316 × 1195; focused source crop: 1260 × 245, normalized to 925 px wide in the comparison.
- Implementation crop: 925 × 112 pixels at 925 CSS px wide.
- State: dark mode, Wednesday 29 July 2026, one finished `other` event titled “Work”, 5:30 PM–8:30 PM.

## Findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the implementation uses Focal's existing Geist UI font and reproduces the source's 16 px title, time, and status hierarchy. The generated source uses slightly larger optical spacing; the implementation intentionally follows Focal's established desktop density.
- Spacing and layout rhythm: both source and implementation use a left-aligned section label, time-led row, connecting rule, completion checkpoint, content label, and trailing status/action. The implementation is vertically tighter so the complete `DayDetail` stays near the user's original 144 px component footprint.
- Colors and tokens: neutral dark surfaces, hairline borders, muted metadata, and restrained semantic success green follow the source and existing theme tokens. Completion is also communicated with iconography and text.
- Image and icon fidelity: the selected design contains no raster assets. Existing Lucide check-circle and chevron icons closely match the source and remain crisp at UI scale.
- Copy and content: “Completed”, “1 item”, “Work”, “Other”, “Done”, and the en-dash time range match the selected direction.
- Accessibility and affordance: text is no longer globally dimmed, the full row remains a 64 px click target, completion does not rely on color alone, and hover/focus/selected states remain available through the existing button behavior.

## Comparison history

1. Initial implementation crop was 925 × 84 and read materially denser than the source (P2). Increased the section hierarchy, 16 px row typography, header spacing, and row height.
2. Post-fix implementation crop is 925 × 112. The remaining height difference is intentional: the ImageGen source was produced on a taller canvas than the supplied 1586 × 144 component reference, while the implementation preserves the real HomeView layout density. No P0/P1/P2 differences remain.

## Interaction and runtime checks

- Primary row click tested: selected event updated to `completed-work`.
- Context menu tested: right-click opened the existing Edit/Delete actions.
- Clean final browser tab checked for console warnings and errors: none.
- Responsive CSS retains a stacked pre-640 px layout. The in-app browser's minimum captured width was 983 px, so the sub-640 visual state remains a residual test gap rather than a known defect.

## Follow-up polish

- P3: capture the light theme and sub-640 layout in a runtime that permits narrower desktop viewports if those states need pixel-level sign-off.

final result: passed
