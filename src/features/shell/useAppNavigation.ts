import { useCallback, useMemo, useState } from "react"

export type AppDestination =
  | { kind: "home" }
  | { kind: "project"; projectId: string }
  | { kind: "timetable" }
  | { kind: "analytics" }
  | { kind: "settings" }

const HOME: AppDestination = { kind: "home" }

export interface AppNavigationState {
  destination: AppDestination
  previousDestination: AppDestination
}

export function navigateTo(
  state: AppNavigationState,
  destination: AppDestination,
): AppNavigationState {
  return {
    destination,
    previousDestination: destination.kind === "settings" && state.destination.kind !== "settings"
      ? state.destination
      : state.previousDestination,
  }
}

export function closeSettingsDestination(state: AppNavigationState): AppNavigationState {
  return state.destination.kind === "settings"
    ? { destination: state.previousDestination, previousDestination: HOME }
    : state
}

export function useAppNavigation() {
  const [state, setState] = useState<AppNavigationState>({
    destination: HOME,
    previousDestination: HOME,
  })
  const destination = state.destination

  const navigate = useCallback((next: AppDestination) => {
    setState((current) => navigateTo(current, next))
  }, [])

  const selectProject = useCallback((projectId: string) => {
    navigate({ kind: "project", projectId })
  }, [navigate])
  const selectHome = useCallback(() => navigate(HOME), [navigate])
  const selectTimetable = useCallback(() => navigate({ kind: "timetable" }), [navigate])
  const selectAnalytics = useCallback(() => navigate({ kind: "analytics" }), [navigate])
  const openSettings = useCallback(() => navigate({ kind: "settings" }), [navigate])
  const closeSettings = useCallback(() => {
    setState(closeSettingsDestination)
  }, [])

  const selectedId = destination.kind === "project" ? destination.projectId : null
  const homeSelected = destination.kind === "home"
  const timetableView = destination.kind === "timetable"
  const analyticsView = destination.kind === "analytics"
  const settingsView = destination.kind === "settings"

  return useMemo(() => ({
    destination,
    selectedId,
    homeSelected,
    timetableView,
    analyticsView,
    settingsView,
    selectProject,
    selectHome,
    selectTimetable,
    selectAnalytics,
    openSettings,
    closeSettings,
  }), [
    analyticsView,
    closeSettings,
    destination,
    homeSelected,
    openSettings,
    selectAnalytics,
    selectHome,
    selectProject,
    selectedId,
    selectTimetable,
    settingsView,
    timetableView,
  ])
}
