/**
 * Weekly Review — real completed schedules (today / yesterday / week) + AI review.
 */

import { useMemo, useState } from "react";
import {
  Calendar,
  Target,
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

function isoDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return isoDay(d);
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
  const [selectedWeek, setSelectedWeek] = useState<"current" | "last">("current");
  const [aiText, setAiText] = useState("");

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

  const weekRange = getWeekRange(selectedWeek);

  const doneBlocks = useMemo(() => {
    const all = (schedule || []).filter((b) => b.isCompleted);
    const byDate = (day: string) =>
      all.filter((b) => (b.completedAt || today) === day);
    const week = all.filter((b) => {
      const d = b.completedAt || today;
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

  const buildDoneSummary = () => {
    const fmt = (blocks: DailyScheduleBlock[]) =>
      blocks.length
        ? blocks.map((b) => `• ${b.title} (${b.startTime}–${b.endTime})`).join("\n")
        : "• (none yet)";
    return {
      todayText: fmt(doneBlocks.today),
      yesterdayText: fmt(doneBlocks.yesterday),
      weekText: fmt(doneBlocks.week),
    };
  };

  const generateAIReview = async () => {
    setIsLoading(true);
    setAiText("");
    try {
      const { todayText, yesterdayText, weekText } = buildDoneSummary();
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
      // Let the Productivity Coach chat also surface this review
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
    if (!aiReview) return;
    const report = `
WEEKLY PRODUCTIVITY REVIEW
${weekRange.label}
${"=".repeat(40)}

GRADE: ${aiReview.weeklyGrade}

SUMMARY
${aiReview.summary}

COMPLETED TODAY (${doneBlocks.today.length})
${doneBlocks.today.map((b) => `• ${b.title} (${b.startTime}–${b.endTime})`).join("\n") || "• none"}

COMPLETED YESTERDAY (${doneBlocks.yesterday.length})
${doneBlocks.yesterday.map((b) => `• ${b.title} (${b.startTime}–${b.endTime})`).join("\n") || "• none"}

COMPLETED THIS WEEK (${doneBlocks.week.length})
${doneBlocks.week.map((b) => `• ${b.title} (${b.startTime}–${b.endTime})`).join("\n") || "• none"}

HIGHLIGHTS
${aiReview.highlights.map((h) => `• ${h}`).join("\n")}

AREAS FOR IMPROVEMENT
${aiReview.improvements.map((i) => `• ${i}`).join("\n")}

RECOMMENDATIONS
${aiReview.recommendations.map((r) => `• ${r}`).join("\n")}
    `.trim();
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-review-${weekRange.start}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported!");
  };

  const DoneList = ({
    title,
    blocks,
    empty,
  }: {
    title: string;
    blocks: DailyScheduleBlock[];
    empty: string;
  }) => (
    <div className="p-3 border border-border rounded-lg bg-black/40">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-foreground" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          {blocks.length}
        </Badge>
      </div>
      {blocks.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {blocks.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-2 text-sm rounded-md border border-border/50 px-2 py-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
              <span className="flex-1 truncate">{b.title}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {b.startTime}–{b.endTime}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={selectedWeek === "current" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedWeek("current")}
          >
            This Week
          </Button>
          <Button
            variant={selectedWeek === "last" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedWeek("last")}
          >
            Last Week
          </Button>
        </div>
        <Badge variant="outline" className="text-xs">
          <Calendar className="h-3 w-3 mr-1" />
          {weekRange.label}
        </Badge>
      </div>

      {/* Completed schedules — today / yesterday / week */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Schedules completed</h3>
        <div className="grid grid-cols-1 gap-2">
          <DoneList
            title="Today"
            blocks={doneBlocks.today}
            empty="Nothing marked done today yet."
          />
          <DoneList
            title="Yesterday"
            blocks={doneBlocks.yesterday}
            empty="No completions logged yesterday."
          />
          <DoneList
            title={`This week (${weekRange.label})`}
            blocks={doneBlocks.week}
            empty="No completed schedules this week yet."
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 border border-border rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-xs text-muted-foreground">Done (week)</span>
          </div>
          <p className="text-xl font-bold">
            {doneBlocks.week.length}
            <span className="text-sm font-normal text-muted-foreground">
              /{Math.max(totalTasks, doneBlocks.week.length)}
            </span>
          </p>
        </div>
        <div className="p-3 border border-border rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Focus Time</span>
          </div>
          <p className="text-xl font-bold">
            {Math.round(totalFocusTime / 60)}h {totalFocusTime % 60}m
          </p>
        </div>
        <div className="p-3 border border-border rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-purple-500" />
            <span className="text-xs text-muted-foreground">Pomodoros</span>
          </div>
          <p className="text-xl font-bold">{totalPomodoros}</p>
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
            <Button variant="outline" size="sm" className="w-full" onClick={exportReport}>
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Generate a review from your real completed schedules</p>
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
