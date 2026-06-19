import { reorderPeriodsIntoSlots } from "../src/lib/timetable";
import type { TimetablePeriod } from "../src/lib/types";

function assertDeepEqual(actual: string[], expected: string[]): void {
  if (actual.length !== expected.length) {
    throw new Error(`Expected ${expected.length} items, got ${actual.length}`);
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(`Expected ${expected[i]} at ${i}, got ${actual[i]}`);
    }
  }
}

function period(
  label: string,
  startTime: string,
  endTime: string,
): TimetablePeriod {
  return {
    period: label,
    subject: label,
    startTime,
    endTime,
  };
}

function scheduleShape(periods: TimetablePeriod[]): string[] {
  return periods.map((p) => `${p.period}@${p.startTime}-${p.endTime}`);
}

const first = period("Math", "09:00", "10:00");
const second = period("English", "10:10", "11:10");
const third = period("Science", "11:20", "12:20");

assertDeepEqual(
  scheduleShape(
    reorderPeriodsIntoSlots({
      periods: [first, second],
      periodToMove: third,
      insertIndex: 0,
      showBreaks: true,
    }),
  ),
  [
    "Science@09:00-10:00",
    "Math@10:10-11:10",
    "English@11:20-12:20",
  ],
);

const recess = period("Recess", "10:00", "10:20");

assertDeepEqual(
  scheduleShape(
    reorderPeriodsIntoSlots({
      periods: [first, recess],
      periodToMove: third,
      insertIndex: 0,
      showBreaks: false,
    }),
  ),
  [
    "Science@09:00-10:00",
    "Recess@10:00-10:20",
    "Math@11:20-12:20",
  ],
);

console.warn("timetable reorder check passed");
