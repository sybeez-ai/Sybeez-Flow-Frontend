/**
 * Planner Reports — today / yesterday / week / month / year + date picker,
 * scores, completed / running / missed, and Ask AI.
 */

import { useMemo, useState } from "react";
import {
  FileBarChart2,
  CheckCircle2,
  CircleDashed,
  AlertTriangle,
  PlayCircle,
  Sparkles,
  Flame,
  Target,
  TrendingUp,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type {
  DailyScheduleBlock,
  DailyStats,
  Goal,
  Habit,
  WeeklyAnalytics,
} from "@/types/dailyLife";
import {
  buildPeriodReport,
  isoDay,
  loadReportSelection,
  resolveRange,
  saveReportSelection,
  type ReportPreset,
} from "@/services/plannerReportsService";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PlannerReportsProps {
  schedule: DailyScheduleBlock[];
  habits: Habit[];
  goals: Goal[];
  dailyStats: DailyStats[];
  weeklyAnalytics?: WeeklyAnalytics | null;
}

const PRESETS: { id: ReportPreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This week" },
  { id: "lastWeek", label: "Last week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "custom", label: "Custom" },
];

function ScoreRing({ value, grade }: { value: number; grade: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-4">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-border">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(hsl(var(--foreground)) ${pct * 3.6}deg, transparent 0)`,
            mask: "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 0)",
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 0)",
            opacity: 0.85,
          }}
        />
        <div className="relative text-center">
          <p className="text-lg font-bold tabular-nums leading-none">{pct}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{grade}</p>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4" />
          Productivity score
        </p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
          Blend of tasks completed, habits, and logged focus for this period.
        </p>
      </div>
    </div>
  );
}

function TaskList({
  title,
  icon: Icon,
  items,
  empty,
  tone,
}: {
  title: string;
  icon: React.FC<{ className?: string }>;
  items: DailyScheduleBlock[];
  empty: string;
  tone: "ok" | "warn" | "run" | "muted";
}) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-500/25 bg-emerald-500/5"
      : tone === "warn"
        ? "border-rose-500/25 bg-rose-500/5"
        : tone === "run"
          ? "border-sky-500/25 bg-sky-500/5"
          : "border-border bg-muted/20";

  return (
    <div className={cn("rounded-xl border p-3 space-y-2", toneCls)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </p>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{empty}</p>
      ) : (
        <ul className="space-y-1.5 max-h-48 overflow-y-auto">
          {items.map((b) => (
            <li
              key={b.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{b.title}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {b.startTime}–{b.endTime}
                  {b.date ? ` · ${b.date}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PlannerReports({
  schedule,
  habits,
  goals,
  dailyStats,
}: PlannerReportsProps) {
  const saved = loadReportSelection();
  const [preset, setPreset] = useState<ReportPreset>(saved.preset || "today");
  const [customStart, setCustomStart] = useState(saved.customStart || isoDay());
  const [customEnd, setCustomEnd] = useState(saved.customEnd || isoDay());

  const range = useMemo(
    () => resolveRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  const report = useMemo(
    () =>
      buildPeriodReport({
        schedule,
        habits,
        goals,
        analytics: dailyStats,
        range,
      }),
    [schedule, habits, goals, dailyStats, range],
  );

  const selectPreset = (p: ReportPreset) => {
    setPreset(p);
    saveReportSelection({
      preset: p,
      customStart,
      customEnd,
    });
  };

  const onCustomChange = (start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
    setPreset("custom");
    saveReportSelection({ preset: "custom", customStart: start, customEnd: end });
  };

  const askAI = () => {
    saveReportSelection({ preset, customStart, customEnd });
    const s = report.scores;
    const displayPrompt = `Explain my productivity report for ${range.label}.`;
    // Full facts go to the model; chat shows the short displayPrompt
    const prompt =
      `Explain my productivity report for **${range.label}** (${range.start} → ${range.end}).\n\n` +
      `Facts (use only these):\n` +
      `- Score: **${s.productivityAvg}%** (grade ${s.grade})\n` +
      `- Tasks completed: ${s.completedTasks}/${s.totalTasks} (${s.taskCompletionPct}%)\n` +
      `- Habits: ${s.habitsDone}/${s.habitsExpected}\n` +
      `- Focus: ${s.focusMinutes}m, ${s.pomodoros} pomodoros\n` +
      `- Missed tasks (${report.missed.length}): ${
        report.missed
          .slice(0, 8)
          .map((b) => b.title)
          .join(", ") || "none"
      }\n` +
      `- Completed (${report.completed.length}): ${
        report.completed
          .slice(0, 8)
          .map((b) => b.title)
          .join(", ") || "none"
      }\n` +
      `- Still ahead (${report.remaining.length}): ${
        report.remaining
          .slice(0, 6)
          .map((b) => b.title)
          .join(", ") || "none"
      }\n` +
      `- In progress (${report.running.length}): ${
        report.running
          .slice(0, 4)
          .map((b) => b.title)
          .join(", ") || "none"
      }\n\n` +
      `Write a clear, complete answer now (finish every section — do not stop mid-sentence) covering: what went well, what was missed, what the score means, and exact next improvements. ` +
      `Use ## headings, bold key numbers, short bullets, and a short mindmap. Keep it concise but finished.`;

    window.dispatchEvent(
      new CustomEvent("sybeez:coach-ask", {
        detail: {
          sessionId: "productivity-coach",
          prompt,
          displayPrompt,
          contextExtra: {
            reportAsk: {
              label: range.label,
              start: range.start,
              end: range.end,
              scores: s,
              completed: report.completed.slice(0, 8).map((b) => b.title),
              missed: report.missed.slice(0, 8).map((b) => b.title),
              remaining: report.remaining.slice(0, 6).map((b) => b.title),
              running: report.running.slice(0, 4).map((b) => b.title),
              hints: report.improvementHints.slice(0, 4),
            },
          },
        },
      }),
    );
    toast.success("Asking Productivity Coach…", { position: "top-center", duration: 1800 });
  };

  const s = report.scores;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileBarChart2 className="h-4 w-4" />
            Productivity Reports
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            See everything completed, running, and missed — with a clear score.
          </p>
        </div>
        <Button size="sm" onClick={askAI} className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Ask AI about this report
        </Button>
      </div>

      {/* Period chips */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => selectPreset(p.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              preset === p.id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {(preset === "custom") && (
        <div className="rounded-xl border border-border bg-muted/15 p-3 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> From
            </p>
            <Input
              type="date"
              className="h-9 w-[150px]"
              value={customStart}
              onChange={(e) => onCustomChange(e.target.value, customEnd)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">To</p>
            <Input
              type="date"
              className="h-9 w-[150px]"
              value={customEnd}
              onChange={(e) => onCustomChange(customStart, e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground pb-2">
            Showing: <span className="font-medium text-foreground">{range.label}</span>
          </p>
        </div>
      )}

      {/* Score board */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <ScoreRing value={s.productivityAvg} grade={s.grade} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Tasks</p>
            <p className="text-sm font-semibold tabular-nums">
              {s.completedTasks}/{s.totalTasks}
            </p>
            <p className="text-[11px] text-muted-foreground">{s.taskCompletionPct}%</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Habits</p>
            <p className="text-sm font-semibold tabular-nums">
              {s.habitsDone}/{s.habitsExpected}
            </p>
            <p className="text-[11px] text-muted-foreground">{s.habitCompletionPct}%</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Focus</p>
            <p className="text-sm font-semibold tabular-nums">{s.focusMinutes}m</p>
            <p className="text-[11px] text-muted-foreground">{s.pomodoros} pomodoros</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Grade</p>
            <p className="text-sm font-semibold">{s.grade}</p>
            <p className="text-[11px] text-muted-foreground">{range.label}</p>
          </div>
        </div>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TaskList
          title="Completed"
          icon={CheckCircle2}
          items={report.completed}
          empty="Nothing completed in this period yet."
          tone="ok"
        />
        <TaskList
          title={range.preset === "today" ? "Running now" : "In progress / open"}
          icon={PlayCircle}
          items={report.running}
          empty={
            range.preset === "today"
              ? "No task is running right now."
              : "No open timed tasks in this view."
          }
          tone="run"
        />
        <TaskList
          title={range.preset === "yesterday" ? "Missed yesterday" : "Missed"}
          icon={AlertTriangle}
          items={report.missed}
          empty="Nice — nothing missed in this period."
          tone="warn"
        />
        <TaskList
          title="Still ahead"
          icon={CircleDashed}
          items={report.remaining}
          empty="No upcoming items left for this view."
          tone="muted"
        />
      </div>

      {/* Habits & goals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-muted/15 p-3 space-y-2">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5" /> Habits to improve
          </p>
          {report.habitsMissed.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">All tracked habits look solid.</p>
          ) : (
            <ul className="space-y-1">
              {report.habitsMissed.map((h) => (
                <li key={h.id} className="text-sm flex items-center gap-2">
                  <span>{h.icon || "•"}</span>
                  <span className="font-medium">{h.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-border bg-muted/15 p-3 space-y-2">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" /> Goals
          </p>
          {report.goals.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No goals yet.</p>
          ) : (
            <ul className="space-y-2">
              {report.goals.slice(0, 6).map((g) => (
                <li key={g.id}>
                  <div className="flex items-center justify-between text-sm gap-2">
                    <span className="font-medium truncate">{g.title}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{g.percent}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-foreground/80"
                      style={{ width: `${g.percent}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Improvement */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <p className="text-xs font-semibold">Where to improve</p>
        <ul className="space-y-1.5">
          {report.improvementHints.map((h) => (
            <li key={h} className="text-sm text-muted-foreground leading-relaxed pl-3 relative before:absolute before:left-0 before:top-[0.55em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-foreground/50">
              {h}
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={askAI}>
          <Sparkles className="h-3.5 w-3.5" />
          Get a full AI explanation
        </Button>
      </div>
    </div>
  );
}
