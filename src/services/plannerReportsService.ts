/**
 * Productivity Planner reports — period rollups for today / yesterday /
 * week / month / year / custom dates, with scores and AI-ready snapshots.
 */

import type {
  DailyScheduleBlock,
  DailyStats,
  Goal,
  Habit,
} from "@/types/dailyLife";
import { usGetItem, usSetItem } from "@/services/userStorage";

export type ReportPreset =
  | "today"
  | "yesterday"
  | "week"
  | "lastWeek"
  | "month"
  | "year"
  | "custom";

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;
  label: string;
  preset: ReportPreset;
}

export interface ReportScores {
  taskCompletionPct: number;
  habitCompletionPct: number;
  productivityAvg: number;
  focusMinutes: number;
  pomodoros: number;
  grade: string;
  completedTasks: number;
  totalTasks: number;
  habitsDone: number;
  habitsExpected: number;
}

export interface PlannerPeriodReport {
  range: DateRange;
  completed: DailyScheduleBlock[];
  running: DailyScheduleBlock[];
  remaining: DailyScheduleBlock[];
  missed: DailyScheduleBlock[];
  habitsDone: Habit[];
  habitsMissed: Habit[];
  goals: Array<{
    id: string;
    title: string;
    percent: number;
    type: string;
    isCompleted: boolean;
  }>;
  scores: ReportScores;
  improvementHints: string[];
}

const SELECTION_KEY = "sybeez_planner_report_selection";

export function isoDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return isoDay(d);
}

function timeToMinutes(t: string): number {
  const [h, m] = (t || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function isHappeningNow(startTime: string, endTime: string, now = new Date()): boolean {
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return end >= start ? mins >= start && mins < end : mins >= start || mins < end;
}

export function isPastEnd(endTime: string, now = new Date()): boolean {
  return timeToMinutes(endTime) <= now.getHours() * 60 + now.getMinutes();
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  return isoDay(d);
}

export function resolveRange(
  preset: ReportPreset,
  customStart?: string,
  customEnd?: string,
  today = isoDay(),
): DateRange {
  const yesterday = shiftDay(today, -1);
  if (preset === "today") {
    return { start: today, end: today, label: "Today", preset };
  }
  if (preset === "yesterday") {
    return { start: yesterday, end: yesterday, label: "Yesterday", preset };
  }
  if (preset === "week") {
    const start = mondayOf(today);
    return { start, end: today, label: "This week", preset };
  }
  if (preset === "lastWeek") {
    const thisMon = mondayOf(today);
    const start = shiftDay(thisMon, -7);
    const end = shiftDay(thisMon, -1);
    return { start, end, label: "Last week", preset };
  }
  if (preset === "month") {
    const start = `${today.slice(0, 7)}-01`;
    return { start, end: today, label: "This month", preset };
  }
  if (preset === "year") {
    const start = `${today.slice(0, 4)}-01-01`;
    return { start, end: today, label: "This year", preset };
  }
  const start = customStart || today;
  const end = customEnd || customStart || today;
  const a = start <= end ? start : end;
  const b = start <= end ? end : start;
  return {
    start: a,
    end: b,
    label:
      a === b
        ? new Date(`${a}T12:00:00`).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : `${a} → ${b}`,
    preset: "custom",
  };
}

function blockDay(b: DailyScheduleBlock, fallbackToday: string): string {
  if (b.date && /^\d{4}-\d{2}-\d{2}/.test(b.date)) return b.date.slice(0, 10);
  if (b.completedAt && /^\d{4}-\d{2}-\d{2}/.test(b.completedAt)) {
    return b.completedAt.slice(0, 10);
  }
  // Undated schedule blocks belong to "today's plan"
  return fallbackToday;
}

function inRange(day: string, range: DateRange): boolean {
  return day >= range.start && day <= range.end;
}

function gradeFromPct(pct: number): string {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 55) return "C";
  if (pct >= 40) return "D";
  if (pct > 0) return "E";
  return "—";
}

function habitExpectedDays(habit: Habit, range: DateRange): number {
  const freq = (habit.frequency || "daily").toLowerCase();
  let days = 0;
  for (let d = range.start; d <= range.end; d = shiftDay(d, 1)) {
    const dow = new Date(`${d}T12:00:00`).getDay(); // 0 Sun
    if (freq === "daily") days += 1;
    else if (freq === "weekdays" && dow >= 1 && dow <= 5) days += 1;
    else if (freq === "weekends" && (dow === 0 || dow === 6)) days += 1;
    else if (freq === "weekly") {
      // count once per week — mark Monday as expected check-in day
      if (dow === 1) days += 1;
    } else days += 1;
  }
  return Math.max(1, days);
}

export function buildPeriodReport(input: {
  schedule: DailyScheduleBlock[];
  habits: Habit[];
  goals: Goal[];
  analytics?: DailyStats[];
  range: DateRange;
  now?: Date;
}): PlannerPeriodReport {
  const today = isoDay(input.now);
  const yesterday = shiftDay(today, -1);
  const range = input.range;
  const schedule = input.schedule || [];
  const habits = input.habits || [];
  const goals = input.goals || [];
  const analytics = input.analytics || [];

  const completed: DailyScheduleBlock[] = [];
  const running: DailyScheduleBlock[] = [];
  const remaining: DailyScheduleBlock[] = [];
  const missed: DailyScheduleBlock[] = [];

  for (const b of schedule) {
    const day = blockDay(b, today);
    if (b.isCompleted) {
      const doneDay = (b.completedAt || day).slice(0, 10);
      if (inRange(doneDay, range)) completed.push(b);
      continue;
    }

    // Incomplete
    if (range.preset === "today" || (range.start === today && range.end === today)) {
      if (day === today || !b.date) {
        if (isHappeningNow(b.startTime, b.endTime, input.now)) running.push(b);
        else if (isPastEnd(b.endTime, input.now)) missed.push(b);
        else remaining.push(b);
      }
      continue;
    }

    if (range.preset === "yesterday" || (range.start === yesterday && range.end === yesterday)) {
      // Yesterday's plan: dated yesterday, or undated incomplete treated as miss if we can't prove today-only
      if (b.date === yesterday) missed.push(b);
      continue;
    }

    // Multi-day ranges: incomplete blocks dated inside the range are misses
    if (b.date && inRange(b.date, range) && b.date < today) {
      missed.push(b);
    } else if (b.date && inRange(b.date, range) && b.date === today) {
      if (isHappeningNow(b.startTime, b.endTime, input.now)) running.push(b);
      else if (isPastEnd(b.endTime, input.now)) missed.push(b);
      else remaining.push(b);
    }
  }

  // Habits
  const habitsDone: Habit[] = [];
  const habitsMissed: Habit[] = [];
  let habitsDoneCount = 0;
  let habitsExpected = 0;
  for (const h of habits) {
    const dates = new Set((h.completedDates || []).map((d) => d.slice(0, 10)));
    const expected = habitExpectedDays(h, range);
    habitsExpected += expected;
    let doneInRange = 0;
    for (let d = range.start; d <= range.end; d = shiftDay(d, 1)) {
      if (dates.has(d)) doneInRange += 1;
    }
    habitsDoneCount += doneInRange;
    if (doneInRange > 0) habitsDone.push(h);
    if (doneInRange < expected) habitsMissed.push(h);
  }

  // Analytics average
  const statsInRange = analytics.filter((s) => s.date >= range.start && s.date <= range.end);
  const productivityAvg = statsInRange.length
    ? Math.round(
        statsInRange.reduce((s, a) => s + (a.productivityScore || 0), 0) / statsInRange.length,
      )
    : 0;
  const focusMinutes = statsInRange.reduce((s, a) => s + (a.focusTime || 0), 0);
  const pomodoros = statsInRange.reduce((s, a) => s + (a.pomodorosCompleted || 0), 0);

  const totalTasks =
    completed.length + missed.length + running.length + remaining.length ||
    completed.length + missed.length;
  const taskCompletionPct =
    totalTasks > 0 ? Math.round((completed.length / totalTasks) * 100) : completed.length ? 100 : 0;
  const habitCompletionPct =
    habitsExpected > 0 ? Math.round((habitsDoneCount / habitsExpected) * 100) : 0;

  // Blend score: prefer analytics avg when present, else task+habit blend
  const blended =
    statsInRange.length > 0
      ? productivityAvg
      : Math.round(taskCompletionPct * 0.7 + habitCompletionPct * 0.3);

  const goalRows = goals.map((g) => {
    const pct =
      g.targetValue > 0
        ? Math.min(100, Math.round((g.currentValue / g.targetValue) * 100))
        : g.isCompleted
          ? 100
          : 0;
    return {
      id: g.id,
      title: g.title,
      percent: pct,
      type: g.type,
      isCompleted: !!g.isCompleted,
    };
  });

  const improvementHints: string[] = [];
  if (missed.length) {
    improvementHints.push(
      `You missed ${missed.length} schedule item(s) in ${range.label} — reschedule or finish the highest-priority ones first.`,
    );
  }
  if (running.length) {
    improvementHints.push(
      `${running.length} task(s) are running now — finish or park them before starting something new.`,
    );
  }
  if (habitCompletionPct < 60 && habits.length) {
    improvementHints.push(
      `Habit consistency is ${habitCompletionPct}% — protect 1–2 key habits daily before adding more.`,
    );
  }
  if (taskCompletionPct < 50 && totalTasks > 0) {
    improvementHints.push(
      `Task completion is ${taskCompletionPct}% — shrink the plan to 3 must-dos and clear the rest.`,
    );
  }
  if (blended >= 80) {
    improvementHints.push("Strong period — keep the same morning start and end-of-day check-in.");
  }
  if (!improvementHints.length) {
    improvementHints.push("Log completions as you go so reports and coaching stay accurate.");
  }

  return {
    range,
    completed,
    running,
    remaining,
    missed,
    habitsDone,
    habitsMissed,
    goals: goalRows,
    scores: {
      taskCompletionPct,
      habitCompletionPct,
      productivityAvg: blended,
      focusMinutes,
      pomodoros,
      grade: gradeFromPct(blended),
      completedTasks: completed.length,
      totalTasks: Math.max(totalTasks, completed.length),
      habitsDone: habitsDoneCount,
      habitsExpected,
    },
    improvementHints,
  };
}

/** Snapshot for AI + UI persistence */
export function saveReportSelection(selection: {
  preset: ReportPreset;
  customStart?: string;
  customEnd?: string;
}): void {
  try {
    usSetItem(SELECTION_KEY, JSON.stringify(selection));
  } catch {
    /* ignore */
  }
}

export function loadReportSelection(): {
  preset: ReportPreset;
  customStart?: string;
  customEnd?: string;
} {
  try {
    const raw = usGetItem(SELECTION_KEY);
    if (!raw) return { preset: "today" };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.preset === "string") return parsed;
  } catch {
    /* ignore */
  }
  return { preset: "today" };
}

export function formatReportForAI(report: PlannerPeriodReport): string {
  const s = report.scores;
  const lines: string[] = [
    `## Productivity report — ${report.range.label}`,
    "",
    `**Score:** ${s.productivityAvg}% · **Grade:** ${s.grade}`,
    `- Tasks: **${s.completedTasks}/${s.totalTasks}** completed (${s.taskCompletionPct}%)`,
    `- Habits: **${s.habitsDone}/${s.habitsExpected}** check-ins (${s.habitCompletionPct}%)`,
    `- Focus: **${s.focusMinutes}** min · Pomodoros: **${s.pomodoros}**`,
    "",
  ];

  if (report.running.length) {
    lines.push("### ▶️ Running now");
    for (const b of report.running) {
      lines.push(`- **${b.title}** (${b.startTime}–${b.endTime})`);
    }
    lines.push("");
  }

  if (report.completed.length) {
    lines.push("### ✅ Completed");
    for (const b of report.completed.slice(0, 20)) {
      lines.push(`- **${b.title}** (${b.startTime}–${b.endTime})`);
    }
    if (report.completed.length > 20) lines.push(`- … +${report.completed.length - 20} more`);
    lines.push("");
  }

  if (report.missed.length) {
    lines.push("### ⚠️ Missed");
    for (const b of report.missed.slice(0, 20)) {
      lines.push(`- **${b.title}** (${b.startTime}–${b.endTime})`);
    }
    lines.push("");
  }

  if (report.remaining.length) {
    lines.push("### ⏳ Still ahead today");
    for (const b of report.remaining.slice(0, 15)) {
      lines.push(`- **${b.title}** (${b.startTime}–${b.endTime})`);
    }
    lines.push("");
  }

  if (report.habitsMissed.length) {
    lines.push("### Habits to improve");
    for (const h of report.habitsMissed.slice(0, 10)) {
      lines.push(`- **${h.name}**`);
    }
    lines.push("");
  }

  if (report.goals.length) {
    lines.push("### Goals");
    for (const g of report.goals.slice(0, 10)) {
      lines.push(`- **${g.title}**: ${g.percent}%${g.isCompleted ? " ✅" : ""}`);
    }
    lines.push("");
  }

  lines.push("### Where to improve");
  for (const h of report.improvementHints) lines.push(`- ${h}`);
  lines.push("");
  lines.push(
    "Please explain this report clearly: what went well, what I missed, and a concrete improvement plan.",
  );
  return lines.join("\n");
}

/** Compact object for assistant context */
export function reportSnapshotForAI(
  report: PlannerPeriodReport,
  opts?: { compact?: boolean },
): Record<string, unknown> {
  const compact = !!opts?.compact;
  const take = (arr: string[], n: number) => arr.slice(0, n);
  const titles = (blocks: { title: string }[]) => blocks.map((b) => b.title);

  if (compact) {
    return {
      label: report.range.label,
      scores: {
        productivityAvg: report.scores.productivityAvg,
        grade: report.scores.grade,
        taskCompletionPct: report.scores.taskCompletionPct,
        habitCompletionPct: report.scores.habitCompletionPct,
        completedTasks: report.scores.completedTasks,
        totalTasks: report.scores.totalTasks,
      },
      missedCount: report.missed.length,
      completedCount: report.completed.length,
      runningCount: report.running.length,
    };
  }

  return {
    range: { label: report.range.label, start: report.range.start, end: report.range.end },
    scores: report.scores,
    completedTitles: take(titles(report.completed), 8),
    runningTitles: take(titles(report.running), 5),
    missedTitles: take(titles(report.missed), 8),
    remainingTitles: take(titles(report.remaining), 5),
    habitsMissed: take(
      report.habitsMissed.map((h) => h.name),
      6,
    ),
    habitsDone: take(
      report.habitsDone.map((h) => h.name),
      6,
    ),
    goals: report.goals.slice(0, 6).map((g) => ({
      title: g.title,
      percent: g.percent,
      isCompleted: g.isCompleted,
    })),
    improvementHints: report.improvementHints.slice(0, 4),
  };
}

export function buildPlannerReportsContext(input: {
  schedule: DailyScheduleBlock[];
  habits: Habit[];
  goals: Goal[];
  analytics?: DailyStats[];
}): Record<string, unknown> {
  const today = isoDay();
  const sel = loadReportSelection();
  const selectedRange = resolveRange(sel.preset, sel.customStart, sel.customEnd, today);
  const selected = buildPeriodReport({ ...input, range: selectedRange });

  // Only score summaries for other periods — full lists blow Groq TPM (6k)
  const presets: ReportPreset[] = ["today", "yesterday", "week", "month"];
  const byPreset: Record<string, unknown> = {};
  for (const p of presets) {
    if (p === selectedRange.preset) continue;
    const range = resolveRange(p, undefined, undefined, today);
    const r = buildPeriodReport({ ...input, range });
    byPreset[p] = reportSnapshotForAI(r, { compact: true });
  }

  return {
    selectedPeriod: reportSnapshotForAI(selected),
    periodScores: byPreset,
  };
}
