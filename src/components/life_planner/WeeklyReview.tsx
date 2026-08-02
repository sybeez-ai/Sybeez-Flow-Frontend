/**
 * Weekly Review — day-by-day completed task history + AI review.
 * One place to see everything finished over past days.
 */

import { useMemo, useState } from "react";
import {
  Calendar,
  TrendingUp,
  Flame,
  Brain,
  Clock,
  CheckCircle2,
  Sparkles,
  Trophy,
  Download,
  ListTodo,
  History,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DailyStats,
  WeeklyAnalytics,
  Habit,
  Goal,
  JournalEntry,
  MoodEntry,
  DailyScheduleBlock,
} from "@/types/dailyLife";
import { toast } from "sonner";

interface WeeklyReviewProps {
  dailyStats: DailyStats[];
  weeklyAnalytics: WeeklyAnalytics | null;
  habits: Habit[];
  goals: Goal[];
  journalEntries: JournalEntry[];
  moods: MoodEntry[];
  schedule: DailyScheduleBlock[];
}

type HistoryRange = "7" | "14" | "30" | "week" | "lastWeek";

function isoDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return isoDay(d);
}

function formatDayLabel(iso: string, today: string, yesterday: string): string {
  if (iso === today) return "Today";
  if (iso === yesterday) return "Yesterday";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const WeeklyReview = ({
  dailyStats,
  weeklyAnalytics: _weeklyAnalytics,
  habits,
  goals: _goals,
  journalEntries: _journalEntries,
  moods: _moods,
  schedule,
}: WeeklyReviewProps) => {
  const [historyRange, setHistoryRange] = useState<HistoryRange>("14");
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});

  const today = isoDay();
  const yesterday = shiftDay(today, -1);

  const getWeekRange = (week: "current" | "last") => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfCurrentWeek = new Date(now);
    startOfCurrentWeek.setDate(now.getDate() - diff);
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    if (week === "last") {
      startOfCurrentWeek.setDate(startOfCurrentWeek.getDate() - 7);
    }
    const endOfWeek = new Date(startOfCurrentWeek);
    endOfWeek.setDate(startOfCurrentWeek.getDate() + 6);
    return {
      start: isoDay(startOfCurrentWeek),
      end: isoDay(endOfWeek),
      label: `${startOfCurrentWeek.toLocaleDateString("en", { month: "short", day: "numeric" })} - ${endOfWeek.toLocaleDateString("en", { month: "short", day: "numeric" })}`,
    };
  };

  const dateRange = useMemo(() => {
    if (historyRange === "week") return getWeekRange("current");
    if (historyRange === "lastWeek") return getWeekRange("last");
    const days = Number(historyRange);
    return {
      start: shiftDay(today, -(days - 1)),
      end: today,
      label:
        historyRange === "7"
          ? "Last 7 days"
          : historyRange === "14"
            ? "Last 14 days"
            : "Last 30 days",
    };
  }, [historyRange, today]);

  const weekRange = getWeekRange(
    historyRange === "lastWeek" ? "last" : "current",
  );

  /** All completed tasks grouped by completion day (newest first). */
  const historyByDay = useMemo(() => {
    const all = (schedule || []).filter((b) => b.isCompleted);
    const map = new Map<string, DailyScheduleBlock[]>();
    for (const b of all) {
      const day = (b.completedAt || "").slice(0, 10) || today;
      if (day < dateRange.start || day > dateRange.end) continue;
      const list = map.get(day) || [];
      list.push(b);
      map.set(day, list);
    }
    const days = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    return days.map((day) => ({
      day,
      label: formatDayLabel(day, today, yesterday),
      blocks: (map.get(day) || []).slice().sort((a, b) =>
        (a.startTime || "").localeCompare(b.startTime || ""),
      ),
    }));
  }, [schedule, dateRange.start, dateRange.end, today, yesterday]);

  const totalCompletedInRange = historyByDay.reduce(
    (n, d) => n + d.blocks.length,
    0,
  );

  const doneBlocks = useMemo(() => {
    const all = (schedule || []).filter((b) => b.isCompleted);
    const byDate = (day: string) =>
      all.filter((b) => ((b.completedAt || today).slice(0, 10)) === day);
    const week = all.filter((b) => {
      const d = (b.completedAt || today).slice(0, 10);
      return d >= weekRange.start && d <= weekRange.end;
    });
    return {
      today: byDate(today),
      yesterday: byDate(yesterday),
      week,
    };
  }, [schedule, today, yesterday, weekRange.start, weekRange.end]);

  const weekStats = dailyStats.filter(
    (s) => s.date >= weekRange.start && s.date <= weekRange.end,
  );

  const totalTasks = Math.max(
    weekStats.reduce((acc, s) => acc + s.totalTasks, 0),
    (schedule || []).length,
  );
  const completedTasks = Math.max(
    weekStats.reduce((acc, s) => acc + s.tasksCompleted, 0),
    doneBlocks.week.length,
  );
  const totalFocusTime = weekStats.reduce((acc, s) => acc + s.focusTime, 0);
  const totalPomodoros = weekStats.reduce((acc, s) => acc + s.pomodorosCompleted, 0);
  const avgProductivity =
    weekStats.length > 0
      ? Math.round(
          weekStats.reduce((acc, s) => acc + s.productivityScore, 0) / weekStats.length,
        )
      : totalTasks > 0
        ? Math.round((completedTasks / totalTasks) * 100)
        : 0;

  const topHabits = habits
    .map((h) => ({
      ...h,
      weekCompletions: h.completedDates.filter(
        (d) => d >= weekRange.start && d <= weekRange.end,
      ).length,
    }))
    .sort((a, b) => b.weekCompletions - a.weekCompletions)
    .slice(0, 3);

  /** Habit check-ins in the selected history range, by day. */
  const habitHistoryByDay = useMemo(() => {
    const map = new Map<string, { name: string; icon?: string }[]>();
    for (const h of habits || []) {
      for (const d of h.completedDates || []) {
        const day = d.slice(0, 10);
        if (day < dateRange.start || day > dateRange.end) continue;
        const list = map.get(day) || [];
        list.push({ name: h.name, icon: h.icon });
        map.set(day, list);
      }
    }
    return map;
  }, [habits, dateRange.start, dateRange.end]);

  /** Send weekly review to Productivity Coach chat only (not rendered on this page). */
  const askCoachForWeeklyReview = () => {
    const fmt = (blocks: DailyScheduleBlock[]) =>
      blocks.length
        ? blocks.map((b) => `${b.title} (${b.startTime}–${b.endTime})`).join(", ")
        : "none";
    const displayPrompt = "Generate my weekly review";
    const prompt =
      `Generate my weekly review for **${weekRange.label}** (${weekRange.start} → ${weekRange.end}).\n\n` +
      `Facts (use only these):\n` +
      `- Avg score: **${avgProductivity}%**\n` +
      `- Focus: **${Math.round(totalFocusTime / 60)}h ${totalFocusTime % 60}m**, pomodoros ${totalPomodoros}\n` +
      `- Tasks in stats: ${completedTasks}/${totalTasks}\n` +
      `- Schedules completed this week (${doneBlocks.week.length}): ${fmt(doneBlocks.week)}\n` +
      `- Completed today (${doneBlocks.today.length}): ${fmt(doneBlocks.today)}\n` +
      `- Completed yesterday (${doneBlocks.yesterday.length}): ${fmt(doneBlocks.yesterday)}\n` +
      `- Top habits: ${
        topHabits.length
          ? topHabits.map((h) => `${h.name} (${h.weekCompletions}/7)`).join(", ")
          : "none"
      }\n\n` +
      `Write a complete review now (finish every section — do not stop mid-sentence). Use ## headings: Summary, Grade, Highlights, Improvements, Recommendations, Focus. ` +
      `Keep each section short (2–4 bullets). Be honest — do not invent completed work. Bold key numbers; end with a short mindmap.`;

    window.dispatchEvent(
      new CustomEvent("sybeez:coach-ask", {
        detail: {
          sessionId: "productivity-coach",
          prompt,
          displayPrompt,
          contextExtra: {
            weeklyReviewAsk: {
              label: weekRange.label,
              start: weekRange.start,
              end: weekRange.end,
              avgProductivity,
              focusMinutes: totalFocusTime,
              pomodoros: totalPomodoros,
              completedWeek: doneBlocks.week.slice(0, 12).map((b) => b.title),
              completedToday: doneBlocks.today.slice(0, 8).map((b) => b.title),
              completedYesterday: doneBlocks.yesterday.slice(0, 8).map((b) => b.title),
            },
          },
        },
      }),
    );
    toast.success("Asking Productivity Coach…", { position: "top-center", duration: 1800 });
  };

  const exportReport = () => {
    const lines = [
      "COMPLETED TASK HISTORY",
      dateRange.label,
      "=".repeat(40),
      "",
      `Total completed: ${totalCompletedInRange}`,
      "",
      ...historyByDay.flatMap((g) => [
        `${g.label} (${g.day}) — ${g.blocks.length}`,
        ...g.blocks.map((b) => `  • ${b.title} (${b.startTime}–${b.endTime})`),
        "",
      ]),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `completed-tasks-${dateRange.start}-to-${dateRange.end}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("History exported");
  };

  const toggleDay = (day: string) => {
    setCollapsedDays((prev) => ({ ...prev, [day]: !prev[day] }));
  };

  const rangeButtons: { id: HistoryRange; label: string }[] = [
    { id: "7", label: "7 days" },
    { id: "14", label: "14 days" },
    { id: "30", label: "30 days" },
    { id: "week", label: "This week" },
    { id: "lastWeek", label: "Last week" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-black/30 overflow-hidden">
        <div className="p-3 border-b border-border/60 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-foreground" />
              <h3 className="text-sm font-semibold">Completed history</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Everything you marked done — grouped by day
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] tabular-nums shrink-0">
            {totalCompletedInRange} done
          </Badge>
        </div>

        <div className="p-3 flex flex-wrap gap-1.5 border-b border-border/40">
          {rangeButtons.map((b) => (
            <Button
              key={b.id}
              variant={historyRange === b.id ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setHistoryRange(b.id)}
            >
              {b.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs ml-auto"
            onClick={exportReport}
            disabled={totalCompletedInRange === 0}
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        </div>

        <div className="max-h-[min(52vh,420px)] overflow-y-auto p-2 space-y-1.5">
          {historyByDay.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No completed tasks in this range</p>
              <p className="text-xs mt-1">
                Mark items done on the Schedule tab — they show up here by day.
              </p>
            </div>
          ) : (
            historyByDay.map((group) => {
              const collapsed = !!collapsedDays[group.day];
              const habitsThatDay = habitHistoryByDay.get(group.day) || [];
              return (
                <div
                  key={group.day}
                  className="rounded-md border border-border/50 bg-black/40 overflow-hidden"
                >
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors"
                    onClick={() => toggleDay(group.day)}
                  >
                    {collapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium flex-1">{group.label}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums hidden sm:inline">
                      {group.day}
                    </span>
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      {group.blocks.length}
                    </Badge>
                  </button>
                  {!collapsed && (
                    <ul className="px-2 pb-2 space-y-1">
                      {group.blocks.map((b) => (
                        <li
                          key={b.id}
                          className="flex items-center gap-2 text-sm rounded-md border border-border/40 px-2 py-1.5"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          <span className="flex-1 truncate">{b.title}</span>
                          {b.type && (
                            <span className="text-[10px] text-muted-foreground capitalize shrink-0">
                              {b.type}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                            {b.startTime}–{b.endTime}
                          </span>
                        </li>
                      ))}
                      {habitsThatDay.length > 0 && (
                        <li className="pt-1 mt-1 border-t border-border/30">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 mb-1">
                            Habits checked
                          </p>
                          <div className="flex flex-wrap gap-1 px-1">
                            {habitsThatDay.map((h, i) => (
                              <Badge
                                key={`${h.name}-${i}`}
                                variant="secondary"
                                className="text-[10px] font-normal"
                              >
                                {h.icon ? `${h.icon} ` : ""}
                                {h.name}
                              </Badge>
                            ))}
                          </div>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 border border-border rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-xs text-muted-foreground">In range</span>
          </div>
          <p className="text-xl font-bold tabular-nums">{totalCompletedInRange}</p>
        </div>
        <div className="p-3 border border-border rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <ListTodo className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Today</span>
          </div>
          <p className="text-xl font-bold tabular-nums">{doneBlocks.today.length}</p>
        </div>
        <div className="p-3 border border-border rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Focus (week)</span>
          </div>
          <p className="text-xl font-bold">
            {Math.round(totalFocusTime / 60)}h {totalFocusTime % 60}m
          </p>
        </div>
        <div className="p-3 border border-border rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            <span className="text-xs text-muted-foreground">Avg Score</span>
          </div>
          <p className="text-xl font-bold">{avgProductivity}%</p>
        </div>
      </div>

      {topHabits.length > 0 && (
        <div className="p-3 border border-border rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-medium">Top Habits This Week</span>
          </div>
          <div className="space-y-2">
            {topHabits.map((habit, index) => (
              <div key={habit.id} className="flex items-center gap-2">
                <span className="text-lg">{habit.icon}</span>
                <span className="text-sm flex-1">{habit.name}</span>
                <Badge variant="outline" className="text-xs">
                  {habit.weekCompletions}/7 days
                </Badge>
                {index === 0 && <Trophy className="h-4 w-4 text-yellow-500" />}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="p-3 bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Brain className="h-4 w-4 text-purple-500 shrink-0" />
            <div className="min-w-0">
              <span className="font-medium text-sm">AI Weekly Review</span>
              <p className="text-[11px] text-muted-foreground truncate">
                Opens in Productivity Coach chat — answer shows there only
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={askCoachForWeeklyReview}
            className="gap-1.5 shrink-0"
          >
            <Sparkles className="h-3 w-3" />
            Ask coach
          </Button>
        </div>
        <div className="p-5 text-center text-muted-foreground">
          <Brain className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">
            Tap <span className="text-foreground font-medium">Ask coach</span> to generate your
            weekly review in chat.
          </p>
          <p className="text-xs mt-1">
            History stats stay here; the AI write-up only appears in the coach panel.
          </p>
        </div>
      </div>
    </div>
  );
};

export default WeeklyReview;
