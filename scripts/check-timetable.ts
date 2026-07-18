import {
  getDayLabelForDate,
  getTimetablePeriodError,
  getTimetablePeriodsForDay,
  isTimetableBreakLabel,
  timetableTimeToMinutes,
} from "../src/lib/timetable.ts"

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

check(timetableTimeToMinutes("09:35") === 575, "valid time should parse")
check(timetableTimeToMinutes("9:35") === null, "partial time should be rejected")
check(timetableTimeToMinutes("24:00") === null, "out-of-range time should be rejected")
check(isTimetableBreakLabel(" Lunch "), "break labels should ignore case and whitespace")

check(
  getTimetablePeriodError({ period: "Period 1", subject: "eng", startTime: "10:00", endTime: "09:00" }) === "End time must be after start time.",
  "invalid period range should be rejected",
)

const periods = getTimetablePeriodsForDay(2, [
  { dayLabel: 2, periods: [{ period: "Period 2", subject: "chem", startTime: "10:00", endTime: "11:00" }] },
  { dayLabel: 1, periods: [{ period: "Other day", subject: "eng", startTime: "08:00", endTime: "09:00" }] },
  { dayLabel: 2, periods: [{ period: "Period 1", subject: "eng", startTime: "09:00", endTime: "10:00" }] },
])
check(periods.map((period) => period.period).join(",") === "Period 1,Period 2", "duplicate day entries should merge and sort")

check(getDayLabelForDate(new Date(2026, 0, 30), "2026-01-26", [], 10) === 5, "weekdays should advance the cycle")
check(getDayLabelForDate(new Date(2026, 0, 31), "2026-01-26", [], 10) === null, "weekends should be skipped")
check(
  getDayLabelForDate(
    new Date(2026, 1, 2),
    "2026-01-26",
    [{ name: "Break", startDate: "2026-02-02", endDate: "2026-02-06" }],
    10,
  ) === null,
  "holidays should pause the timetable",
)
check(
  getDayLabelForDate(
    new Date(2026, 1, 9),
    "2026-01-26",
    [{ name: "Break", startDate: "2026-02-02", endDate: "2026-02-06" }],
    10,
  ) === 6,
  "the cycle should resume where it stopped after a holiday",
)

console.warn("Timetable checks passed")
