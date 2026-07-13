import { advanceTimer, closeRunningInterval } from "../src/components/StudyTimer.tsx";

const settings = { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 };
const runningWork = {
  running: true,
  mode: "work",
  secondsLeft: 10,
  cycles: 0,
  studyOvertime: false,
  overtimeSeconds: 0,
};

function check(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

check(advanceTimer(runningWork, settings, 3), {
  ...runningWork,
  secondsLeft: 7,
});
check(advanceTimer(runningWork, settings, 10), {
  running: true,
  mode: "break",
  secondsLeft: 300,
  cycles: 1,
  studyOvertime: false,
  overtimeSeconds: 0,
});
check(advanceTimer(runningWork, settings, 311), {
  running: false,
  mode: "work",
  secondsLeft: 1500,
  cycles: 1,
  studyOvertime: false,
  overtimeSeconds: 0,
});
check(closeRunningInterval([
  { start: "2026-07-12T10:00:00.000Z", end: "2026-07-12T10:05:00.000Z", source: "pomodoro" },
  { start: "2026-07-12T10:10:00.000Z", source: "pomodoro" },
], "2026-07-12T10:20:00.000Z"), [
  { start: "2026-07-12T10:00:00.000Z", end: "2026-07-12T10:05:00.000Z", source: "pomodoro" },
  { start: "2026-07-12T10:10:00.000Z", source: "pomodoro", end: "2026-07-12T10:20:00.000Z" },
]);
