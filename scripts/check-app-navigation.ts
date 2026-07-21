import {
  closeSettingsDestination,
  navigateTo,
  type AppNavigationState,
} from "../src/features/shell/useAppNavigation"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const initial: AppNavigationState = {
  destination: { kind: "home" },
  previousDestination: { kind: "home" },
}
const project = navigateTo(initial, { kind: "project", projectId: "methods" })
const settings = navigateTo(project, { kind: "settings" })
const restored = closeSettingsDestination(settings)
assert(restored.destination.kind === "project", "closing settings must restore the previous destination")
assert(
  restored.destination.kind === "project" && restored.destination.projectId === "methods",
  "closing settings restored the wrong project",
)

const timetable = navigateTo(restored, { kind: "timetable" })
assert(timetable.destination.kind === "timetable", "primary navigation must be mutually exclusive")
