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
  RefreshCw,
  Sparkles,
  Trophy,
  Lightbulb,
  ArrowRight,
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
import { productivityAI } from "@/services/productivityAIService";
import { cn } from "@/lib/utils";
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

interface AIReviewResponse {
  summary: string;
  highlights: string[];
  improvements: string[];
  recommendations: string[];
  weeklyGrade: string;
  focusAreas: string[];
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
  weeklyAnalytics,
  habits,
  goals: _goals,
  journalEntries: _journalEntries,
  moods: _moods,
  schedule,
}: WeeklyReviewProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [aiReview, setAiReview] = useState<AIReviewResponse | null>(null);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("14");
  const [aiText, setAiText] = useState("");
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

  const generateAIReview = async () => {
    setIsLoading(true);
    setAiText("");
    try {
      const fmt = (blocks: DailyScheduleBlock[]) =>
        blocks.length
          ? blocks.map((b) => `• ${b.title} (${b.startTime}–${b.endTime})`).join("\n")
          : "• (none yet)";
      const todayText = fmt(doneBlocks.today);
      const yesterdayText = fmt(doneBlocks.yesterday);
      const weekText = fmt(doneBlocks.week);

      const analyticsData: WeeklyAnalytics = weeklyAnalytics || {
        weekStart: weekRange.start,
        weekEnd: weekRange.end,
        dailyStats: weekStats,
        avgProductivityScore: avgProductivity,
        totalFocusTime,
        totalPomodorosCompleted: totalPomodoros,
        habitCompletionRate:
          habits.length > 0 && totalTasks > 0
            ? (completedTasks / totalTasks) * 100
            : 0,
        topHabits: topHabits.map((h) => ({
          habitId: h.id,
          completionRate: (h.weekCompletions / 7) * 100,
        })),
        productivityTrend:
          avgProductivity >= 70
            ? "improving"
            : avgProductivity >= 40
              ? "stable"
              : "declining",
      };

      const response = await productivityAI.getWeeklyReview(analyticsData, {
        todayDone: todayText,
        yesterdayDone: yesterdayText,
        weekDone: weekText,
        completedCount: doneBlocks.week.length,
        todayCount: doneBlocks.today.length,
        yesterdayCount: doneBlocks.yesterday.length,
      });

      const responseText = response.message || "";
      setAiText(responseText);

      const review: AIReviewResponse = {
        summary:
          extractSection(responseText, "summary") ||
          (doneBlocks.week.length
            ? `You completed ${doneBlocks.week.length} schedule item(s) this week (${doneBlocks.today.length} today).`
            : "No completed schedules yet this week — mark tasks done on Schedule to build your review."),
        highlights:
          extractList(responseText, "highlights") ||
          extractList(responseText, "wins") ||
          (doneBlocks.today.length
            ? doneBlocks.today.slice(0, 3).map((b) => `Done today: ${b.title}`)
            : doneBlocks.week.length
              ? doneBlocks.week.slice(0, 3).map((b) => `Completed: ${b.title}`)
              : ["Start by completing a schedule item today"]),
        improvements:
          extractList(responseText, "improvements") ||
          extractList(responseText, "improve") ||
          [
            doneBlocks.yesterday.length === 0
              ? "No completions logged yesterday"
              : "Keep yesterday’s momentum",
            totalFocusTime < 60 ? "Add more focused work time" : "Solid focus habit forming",
          ],
        recommendations:
          extractList(responseText, "recommendations") ||
          extractList(responseText, "goals") ||
          [
            "Mark schedules done as you finish them",
            "Pick 3 priorities each morning",
            "Review this page at the end of the week",
          ],
        weeklyGrade:
          extractGrade(responseText) ||
          (avgProductivity >= 80
            ? "A"
            : avgProductivity >= 60
              ? "B"
              : avgProductivity >= 40
                ? "C"
                : doneBlocks.week.length > 0
                  ? "B"
                  : "—"),
        focusAreas:
          extractList(responseText, "focus") || ["Schedule completion", "Consistency"],
      };

      setAiReview(review);
      window.dispatchEvent(
        new CustomEvent("sybeez-planner-review", {
          detail: { text: responseText || formatReviewAsChat(review), week: weekRange.label },
        }),
      );
      toast.success("Weekly review ready");
    } catch (error) {
      console.error("AI Review error:", error);
      const fallback: AIReviewResponse = {
        summary: doneBlocks.week.length
          ? `This week you finished ${doneBlocks.week.length} schedule item(s). Today: ${doneBlocks.today.length}. Yesterday: ${doneBlocks.yesterday.length}.`
          : "No completed schedules yet. Complete tasks on the Schedule tab, then generate again.",
        highlights: doneBlocks.week.slice(0, 5).map((b) => b.title).length
          ? doneBlocks.week.slice(0, 5).map((b) => b.title)
          : ["No completed schedules yet"],
        improvements: [
          doneBlocks.today.length === 0 ? "Complete at least one task today" : "Nice progress today",
          "Log completions so reviews stay accurate",
        ],
        recommendations: [
          "Use Schedule suggestions to plan the day",
          "Mark items done when finished",
          "Ask the Productivity Coach: Generate my weekly review",
        ],
        weeklyGrade: doneBlocks.week.length >= 5 ? "B" : doneBlocks.week.length > 0 ? "C" : "—",
        focusAreas: ["Consistency"],
      };
      setAiReview(fallback);
      setAiText(formatReviewAsChat(fallback));
      window.dispatchEvent(
        new CustomEvent("sybeez-planner-review", {
          detail: { text: formatReviewAsChat(fallback), week: weekRange.label },
        }),
      );
    }
    setIsLoading(false);
  };

  const extractSection = (text: string, section: string): string | null => {
    const regex = new RegExp(`${section}[:\\s]*([^\\n]+)`, "i");
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  };

  const extractList = (text: string, section: string): string[] | null => {
    const lines = text.split("\n");
    const result: string[] = [];
    let capturing = false;
    for (const line of lines) {
      if (line.toLowerCase().includes(section)) {
        capturing = true;
        continue;
      }
      if (capturing && /^\s*[-•*]/.test(line)) {
        result.push(line.replace(/^\s*[-•*]\s*/, "").trim());
      } else if (capturing && result.length > 0 && line.trim() && !/^\s*[-•*]/.test(line)) {
        if (/^[A-Za-z0-9].*:/.test(line.trim())) break;
      }
    }
    return result.length > 0 ? result : null;
  };

  const extractGrade = (text: string): string | null => {
    const match = text.match(/grade[:\s]*([A-F][+-]?)/i);
    return match ? match[1] : null;
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith("A")) return "text-green-500 bg-green-500/10 border-green-500/30";
    if (grade.startsWith("B")) return "text-blue-500 bg-blue-500/10 border-blue-500/30";
    if (grade.startsWith("C")) return "text-yellow-500 bg-yellow-500/10 border-yellow-500/30";
    if (grade === "—") return "text-muted-foreground bg-muted/20 border-border";
    return "text-red-500 bg-red-500/10 border-red-500/30";
  };

  const formatReviewAsChat = (r: AIReviewResponse) =>
    [
      `**Weekly review** (${weekRange.label})`,
      "",
      `**Grade:** ${r.weeklyGrade}`,
      "",
      r.summary,
      "",
      "**Highlights**",
      ...r.highlights.map((h) => `- ✅ ${h}`),
      "",
      "**Areas to improve**",
      ...r.improvements.map((i) => `- 📈 ${i}`),
      "",
      "**Recommendations**",
      ...r.recommendations.map((x) => `- 💡 ${x}`),
    ].join("\n");

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
    if (aiReview) {
      lines.push("AI REVIEW", `GRADE: ${aiReview.weeklyGrade}`, "", aiReview.summary);
    }
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
        <div className="p-3 bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-500" />
            <span className="font-medium text-sm">AI Weekly Review</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void generateAIReview()}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 mr-2" />
                {aiReview ? "Refresh" : "Generate Review"}
              </>
            )}
          </Button>
        </div>

        {aiReview ? (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Weekly Grade</span>
              <div
                className={cn(
                  "text-2xl font-bold px-3 py-1 rounded-lg border",
                  getGradeColor(aiReview.weeklyGrade),
                )}
              >
                {aiReview.weeklyGrade}
              </div>
            </div>
            <p className="text-sm whitespace-pre-wrap">{aiReview.summary}</p>
            {aiText && (
              <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {aiText}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                <span className="text-xs font-medium text-muted-foreground">Highlights</span>
              </div>
              <ul className="space-y-1">
                {aiReview.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-medium text-muted-foreground">Areas to Improve</span>
              </div>
              <ul className="space-y-1">
                {aiReview.improvements.map((imp, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <ArrowRight className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                    {imp}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                <span className="text-xs font-medium text-muted-foreground">Recommendations</span>
              </div>
              <ul className="space-y-1">
                {aiReview.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Generate a review from your completed history</p>
            <p className="text-xs mt-1">
              Or ask the Productivity Coach: “Generate my weekly review”
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WeeklyReview;
