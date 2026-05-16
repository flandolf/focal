## Design Context

### Users
Students managing assignments and coursework across multiple classes. They use Focal during study sessions — in libraries, dorm rooms, coffee shops — to wrangle scattered downloads and project files into organized folders. The job is quick: grab the files, assign them to a project, get back to studying. The app should feel like a well-designed tool, not a dashboard to manage.

### Brand Personality
Sharp · Fast · Minimal. No-nonsense precision, like a good mechanical pencil or a field notebook. The interface should be confident and efficient — every element earns its place, nothing decorative without purpose. Approachable minimalism, not cold minimalism.

### Aesthetic Direction
- **Visual tone**: Precision tool aesthetic. Clean lines, intentional whitespace, subtle structure. Think: Muji meets a drafting table. Not playful, not sterile — quietly capable.
- **Theme**: Both dark and light modes, equally important. System-preference driven with toggle. Dark mode for late-night study sessions; light mode for bright libraries. Both modes must feel equally considered, not one as an afterthought.
- **Typography**: Sharp, condensed, or mechanical-leaning display font for branding moments (empty state, logo, headers), paired with Geist (already in use) as the workhorse UI font.
- **Color**: Muted, intentional palette. The current shadcn neutral is a good base. The accent should be distinctive but restrained — used sparingly to highlight what matters (deadlines, counts, actions). Consider a single color accent (not a rainbow palette).
- **Motion**: Minimal and purposeful. Faster ingress, no gratuitous animations. Transitions should convey state changes clearly (project selected, file added) without slowing the user down.

### Design Principles
1. **Make the default path frictionless** — the happy path (new project → add files) should feel instant. Avoid unnecessary confirmations, modals, or steps.
2. **Visual hierarchy through subtraction** — fewer elements, more contrast between them. Use spacing and weight, not extra UI chrome, to establish hierarchy.
3. **System-familiar, not system-generic** — Focal is a native desktop app (Tauri). It should feel at home on the OS but not blend in. Respect platform conventions while carving a distinct identity.
4. **Accessibility as a matter of course** — WCAG AA contrast in both themes, focus indicators, reduced motion support, and text that never relies on color alone.
5. **Every interaction has intent** — no decorative animations, no border-left accents, no gradient text. If it moves, it communicates something.
