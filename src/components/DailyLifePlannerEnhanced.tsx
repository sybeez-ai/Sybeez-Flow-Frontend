import { usGetItem, usSetItem } from "@/services/userStorage";
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ListTodo, Plus, X, CheckCircle2, Circle, TrendingUp, RefreshCw,
  Flame, Target, Zap, Smile, BookOpen, BarChart2, CalendarDays,
  ClipboardList, Download, Upload, Trash2,
  Database, Shield, Check
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DailyScheduleBlock,
  Habit,
  Goal,
  GoalMilestone,
  PomodoroSettings,
  PomodoroSession,
  CalendarEvent,
  DailyStats,
  WeeklyAnalytics,
  MoodEntry,
  JournalEntry,
  ExtendedDailyLifeData,
} from "@/types/dailyLife";
import { cn } from "@/lib/utils";
import {
  HabitTracker,
  GoalTracker,
  PomodoroTimer,
  MoodTracker,
  DailyJournal,
  ProductivityAnalytics,
  WeeklyReview,
  ProductivityCalendar,
} from "@/components/life_planner";

// ─── Storage ─────────────────────────────────────────────────────────────────
const EXT_KEY = "sybeez_extended_life_data";
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function hasPlannerContent(data: ExtendedDailyLifeData | null | undefined): boolean {
  if (!data) return false;
  return (
    (data.dailySchedule?.length ?? 0) > 0 ||
    (data.habits?.length ?? 0) > 0 ||
    (data.goals?.length ?? 0) > 0
  );
}

async function loadDataFromBackend(): Promise<ExtendedDailyLifeData | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/features/planner/data`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return null;
    const json = await response.json();
    // Ignore empty backend blobs so we never wipe local schedule
    if (!hasPlannerContent(json)) return null;
    return json as ExtendedDailyLifeData;
  } catch {
    return null;
  }
}

async function saveDataToBackend(data: ExtendedDailyLifeData): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/features/planner/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.ok;
  } catch {
    return false;
  }
}
const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  sessionsBeforeLongBreak: 4,
  autoStartBreaks: false,
  autoStartPomodoros: false,
  soundEnabled: true,
  notificationsEnabled: true,
};

function loadExtData(): ExtendedDailyLifeData {
  try {
    const raw = usGetItem(EXT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through to defaults */
  }
  return {
    gymSchedules: [],
    hygieneRoutines: [],
    mealPlans: [],
    mentalHealthSchedules: [],
    workBlocks: [],
    dailySchedule: [],
    preferences: {},
    habits: [],
    goals: [],
    pomodoroSettings: DEFAULT_POMODORO_SETTINGS,
    pomodoroHistory: [],
    calendarEvents: [],
    analytics: [],
    moodHistory: [],
    journal: [],
    aiCoachingHistory: [],
  };
}

function saveExtData(data: ExtendedDailyLifeData) {
  usSetItem(EXT_KEY, JSON.stringify(data));
  // Durable backup (debounced)
  void import("@/services/persistSync").then(({ schedulePlannerPersist }) => {
    schedulePlannerPersist();
  });
}

// ─── Date & streak helpers ────────────────────────────────────────────────────
const isoDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().split('T')[0];
};
const TODAY = isoDay(new Date());

const timeToMinutes = (t: string): number => {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Is a schedule block happening right now? (handles same-day windows) */
const isHappeningNow = (startTime: string, endTime: string): boolean => {
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return end >= start ? now >= start && now < end : now >= start || now < end;
};

/** Compute current + longest streak from a list of ISO completion dates. */
function computeStreaks(dates: string[]): { current: number; longest: number } {
  if (!dates.length) return { current: 0, longest: 0 };
  const set = new Set(dates);
  const sorted = [...set].sort();

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.round(
      (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86_400_000
    );
    if (diff === 1) run += 1;
    else if (diff > 1) run = 1;
    longest = Math.max(longest, run);
  }

  // Current streak counts back from today (allowing yesterday to keep it alive).
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!set.has(isoDay(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(isoDay(cursor))) return { current: 0, longest };
  }
  let current = 0;
  while (set.has(isoDay(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, longest };
}

// ─── Quick Template categories (filters only — no mock schedules) ────────────
const TEMPLATE_META: Record<string, { name: string }> = {
  balanced: { name: "Balanced" },
  early_bird: { name: "Early Bird" },
  hustler: { name: "Hustler" },
  student: { name: "Student" },
  fitness: { name: "Fitness" },
};

const TEMPLATE_LIST = [
  { key: "balanced", emoji: "⚖️" },
  { key: "early_bird", emoji: "🌅" },
  { key: "hustler", emoji: "🚀" },
  { key: "student", emoji: "📚" },
  { key: "fitness", emoji: "💪" },
];

/** Optional activity chips — pick one or type your own. */
const ACTIVITY_SUGGESTIONS: {
  title: string;
  type: DailyScheduleBlock["type"];
  durationMin: number;
}[] = [
  { title: "Wake Up", type: "sleep", durationMin: 30 },
  { title: "Hydrate", type: "hygiene", durationMin: 15 },
  { title: "Morning Exercise", type: "gym", durationMin: 45 },
  { title: "Shower & Fresh Up", type: "hygiene", durationMin: 30 },
  { title: "Breakfast", type: "meal", durationMin: 30 },
  { title: "Deep Work", type: "work", durationMin: 90 },
  { title: "Lunch", type: "meal", durationMin: 45 },
  { title: "Break / Rest", type: "break", durationMin: 15 },
  { title: "Gym / Workout", type: "gym", durationMin: 60 },
  { title: "Dinner", type: "meal", durationMin: 45 },
  { title: "Personal Time", type: "free", durationMin: 60 },
  { title: "Meditation", type: "break", durationMin: 15 },
  { title: "Wind Down", type: "sleep", durationMin: 30 },
  { title: "Sleep", type: "sleep", durationMin: 480 },
];

const DURATION_PRESETS = [
  { label: "15m", minutes: 15 },
  { label: "30m", minutes: 30 },
  { label: "45m", minutes: 45 },
  { label: "1h", minutes: 60 },
  { label: "1.5h", minutes: 90 },
  { label: "2h", minutes: 120 },
];

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function addMinutesToHHMM(start: string, minutes: number): string {
  const [h, m] = (start || "09:00").split(":").map(Number);
  const total = ((h || 0) * 60 + (m || 0) + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
// ─── Tab config ───────────────────────────────────────────────────────────────
type TabId = 'schedule' | 'habits' | 'focus' | 'goals' | 'calendar' | 'mood' | 'journal' | 'stats' | 'review' | 'sync';

const TABS: { id: TabId; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'schedule',  label: 'Schedule',  Icon: ListTodo },
  { id: 'habits',    label: 'Habits',    Icon: Flame },
  { id: 'focus',     label: 'Focus',     Icon: Zap },
  { id: 'goals',     label: 'Goals',     Icon: Target },
  { id: 'calendar',  label: 'Calendar',  Icon: CalendarDays },
  { id: 'mood',      label: 'Mood',      Icon: Smile },
  { id: 'journal',   label: 'Journal',   Icon: BookOpen },
  { id: 'stats',     label: 'Stats',     Icon: BarChart2 },
  { id: 'review',    label: 'Review',    Icon: ClipboardList },
  { id: 'sync',      label: 'Sync',      Icon: RefreshCw },
];

// ─── Component ────────────────────────────────────────────────────────────────
interface DailyLifePlannerProps {
  onClose?: () => void;
}

const DailyLifePlannerEnhanced: React.FC<DailyLifePlannerProps> = ({ onClose }) => {
  const [currentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    try {
      const saved = localStorage.getItem("sybeez_planner_tab") as TabId | null;
      if (saved && ["schedule", "habits", "focus", "goals", "calendar", "mood", "journal", "stats", "review", "sync"].includes(saved)) {
        return saved;
      }
    } catch {
      /* ignore */
    }
    return "schedule";
  });
  const [data, setDataState] = useState<ExtendedDailyLifeData>(loadExtData);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [taskStartTime, setTaskStartTime] = useState("");
  const [taskEndTime, setTaskEndTime] = useState("");
  const [taskDurationMin, setTaskDurationMin] = useState(30);
  const [taskType, setTaskType] = useState<DailyScheduleBlock["type"]>("work");
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const mockClearedRef = useRef(false);

  // Set data with auto-sync
  const setData = useCallback((updater: React.SetStateAction<ExtendedDailyLifeData>) => {
    setDataState(prev => {
      const next = typeof updater === 'function'
        ? (updater as (prevState: ExtendedDailyLifeData) => ExtendedDailyLifeData)(prev)
        : updater;
      saveExtData(next);
      return next;
    });
  }, []);

  // Persist selected planner tab
  useEffect(() => {
    try {
      localStorage.setItem("sybeez_planner_tab", activeTab);
    } catch {
      /* ignore */
    }
  }, [activeTab]);

  // One-time: strip old mock template schedules (keep user-written custom tasks)
  useEffect(() => {
    if (mockClearedRef.current) return;
    mockClearedRef.current = true;
    setData((prev) => {
      const cleaned = (prev.dailySchedule || []).filter((b) => !b.templateKey);
      // Also drop known auto-generated mock titles if they somehow have no templateKey
      const MOCK_TITLES = new Set(
        [
          "Wake Up & Hydrate",
          "Morning Exercise",
          "Fresh Up & Dress",
          "Deep Work - Session 1",
          "Deep Work - Session 2",
          "Break & Recharge",
          "Afternoon Work",
          "Wind Down",
          "Morning Run",
          "Shower & Breakfast",
          "Deep Work Block 1",
          "Deep Work Block 2",
          "Quick Break",
          "Personal Projects",
          "Dinner & Relax",
          "Wake & Fuel",
          "Intense Workout",
          "Quick Refresh",
          "Power Breakfast",
          "Deep Work Sprint 1",
          "Deep Work Sprint 2",
          "Evening Hustle",
          "Reflect & Relax",
          "Wake & Hydrate",
          "Light Workout",
          "Breakfast & Shower",
          "Study Session 1",
          "Study Session 2",
          "Study Session 3",
          "Break & Snack",
          "Personal Project",
          "Cardio Session",
          "Strength Training",
          "Shower & Recovery",
          "Protein Breakfast",
          "Work Block 1",
          "Healthy Lunch",
          "Work Block 2",
          "Evening Yoga",
          "Meal Prep & Sleep",
        ].map((t) => t.toLowerCase()),
      );
      let withoutMock = cleaned.filter(
        (b) => !MOCK_TITLES.has(String(b.title || "").toLowerCase()) || b.description === "Custom task",
      );
      // Stamp completion date on already-done tasks so Review can group them
      withoutMock = withoutMock.map((b) =>
        b.isCompleted && !b.completedAt ? { ...b, completedAt: TODAY } : b,
      );
      const changed =
        withoutMock.length !== (prev.dailySchedule || []).length ||
        withoutMock.some((b, i) => b !== (prev.dailySchedule || [])[i]);
      if (!changed) return prev;
      return { ...prev, dailySchedule: withoutMock };
    });
  }, [setData]);

  // Load: prefer non-empty localStorage; hydrate from backend only if local empty
  useEffect(() => {
    const loadData = async () => {
      try {
        const localData = loadExtData();
        if (hasPlannerContent(localData)) {
          setDataState(localData);
          setIsConnected(true);
          void saveDataToBackend(localData);
        } else {
          const backendData = await loadDataFromBackend();
          if (backendData) {
            setDataState(backendData);
            saveExtData(backendData);
            setIsConnected(true);
          } else {
            setDataState(localData);
            setIsConnected(false);
          }
        }
      } catch (error) {
        console.error("Error loading planner data:", error);
        setDataState(loadExtData());
        setIsConnected(false);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Refresh when AI assistant adds plan tasks / habits
  useEffect(() => {
    const onDataChanged = (e: Event) => {
      const domains = (e as CustomEvent<{ domains?: string[] }>).detail?.domains;
      if (!domains || domains.includes("planner")) {
        setDataState(loadExtData());
      }
    };
    window.addEventListener("sybeez:data-changed", onDataChanged);
    return () => window.removeEventListener("sybeez:data-changed", onDataChanged);
  }, []);

  // Periodically push local → backend (never overwrite local from empty remote)
  useEffect(() => {
    const interval = setInterval(() => {
      if (isConnected) {
        void saveDataToBackend(loadExtData());
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isConnected]);

  const schedule = data.dailySchedule;
  // No Quick Template selected → all schedules; selected → related only
  const visibleSchedule = selectedTemplate
    ? schedule.filter((b) => b.templateKey === selectedTemplate)
    : schedule;
  const completed = visibleSchedule.filter(b => b.isCompleted).length;
  const total = visibleSchedule.length;
  const productivityScore = total > 0 ? Math.round((completed / total) * 100) : 0;

  // ── Today's stats (derived) ─────────────────────────────────────────────────
  const todayStats: DailyStats = useMemo(() => {
    const workSessions = (data.pomodoroHistory || []).filter(
      s => s.type === 'work' && s.isCompleted && (s.completedAt || '').startsWith(TODAY)
    );
    const habitsDoneToday = (data.habits || []).filter(h => h.completedDates.includes(TODAY)).length;
    const todayMoods = (data.moodHistory || []).filter(m => m.date === TODAY);
    const moodScore = todayMoods.length
      ? Math.round(todayMoods.reduce((a, m) => a + m.mood, 0) / todayMoods.length)
      : undefined;
    return {
      date: TODAY,
      tasksCompleted: completed,
      totalTasks: total,
      productivityScore,
      focusTime: workSessions.reduce((a, s) => a + (s.duration || 0), 0),
      pomodorosCompleted: workSessions.length,
      habitsCompleted: habitsDoneToday,
      totalHabits: (data.habits || []).length,
      waterIntake: 0,
      caloriesConsumed: 0,
      moodScore,
    };
  }, [data.pomodoroHistory, data.habits, data.moodHistory, completed, total, productivityScore]);

  // Persist today's stats into analytics history (guarded to avoid render loops).
  useEffect(() => {
    setData(prev => {
      const existing = prev.analytics.find(s => s.date === TODAY);
      if (existing && JSON.stringify(existing) === JSON.stringify(todayStats)) return prev;
      const analytics = [...prev.analytics.filter(s => s.date !== TODAY), todayStats].sort(
        (a, b) => a.date.localeCompare(b.date)
      );
      return { ...prev, analytics };
    });
  }, [todayStats, setData]);

  // Merge persisted analytics with a fresh copy of today's stats for display.
  const analyticsForDisplay = useMemo(
    () => [...data.analytics.filter(s => s.date !== TODAY), todayStats].sort((a, b) => a.date.localeCompare(b.date)),
    [data.analytics, todayStats]
  );

  // ── Weekly analytics (derived) ──────────────────────────────────────────────
  const weeklyAnalytics: WeeklyAnalytics = useMemo(() => {
    const days: DailyStats[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = isoDay(d);
      days.push(
        analyticsForDisplay.find(s => s.date === key) || {
          date: key, tasksCompleted: 0, totalTasks: 0, productivityScore: 0, focusTime: 0,
          pomodorosCompleted: 0, habitsCompleted: 0, totalHabits: 0, waterIntake: 0, caloriesConsumed: 0,
        }
      );
    }
    const active = days.filter(s => s.totalTasks > 0);
    const avgProductivityScore = active.length
      ? Math.round(active.reduce((a, s) => a + s.productivityScore, 0) / active.length)
      : 0;
    const habitCompletionRate = days.reduce((a, s) => a + (s.totalHabits ? s.habitsCompleted / s.totalHabits : 0), 0);
    const firstHalf = days.slice(0, 3).reduce((a, s) => a + s.productivityScore, 0) / 3;
    const secondHalf = days.slice(4).reduce((a, s) => a + s.productivityScore, 0) / 3;
    const trend: WeeklyAnalytics['productivityTrend'] =
      secondHalf > firstHalf + 5 ? 'improving' : secondHalf < firstHalf - 5 ? 'declining' : 'stable';
    return {
      weekStart: days[0].date,
      weekEnd: days[6].date,
      dailyStats: days,
      avgProductivityScore,
      totalFocusTime: days.reduce((a, s) => a + s.focusTime, 0),
      totalPomodorosCompleted: days.reduce((a, s) => a + s.pomodorosCompleted, 0),
      habitCompletionRate: days.length ? Math.round((habitCompletionRate / days.length) * 100) : 0,
      topHabits: (data.habits || [])
        .map(h => ({ habitId: h.id, completionRate: computeStreaks(h.completedDates).current }))
        .sort((a, b) => b.completionRate - a.completionRate)
        .slice(0, 3),
      productivityTrend: trend,
    };
  }, [analyticsForDisplay, data.habits]);

  // ── Schedule ────────────────────────────────────────────────────────────────
  // Quick Templates are filters only — they never inject mock schedules.
  const applyTemplate = (templateKey: string) => {
    if (!TEMPLATE_META[templateKey]) return;
    if (selectedTemplate === templateKey) {
      setSelectedTemplate("");
      toast.info("Showing all schedules", { position: "top-center", duration: 2000 });
      return;
    }
    setSelectedTemplate(templateKey);
    toast.success(`Showing ${TEMPLATE_META[templateKey].name} schedules`, {
      position: "top-center",
      duration: 2000,
    });
  };

  const pickSuggestion = (s: (typeof ACTIVITY_SUGGESTIONS)[number]) => {
    setNewTaskTitle(s.title);
    setTaskType(s.type);
    setTaskDurationMin(s.durationMin);
    const start = taskStartTime || nowHHMM();
    if (!taskStartTime) setTaskStartTime(start);
    setTaskEndTime(addMinutesToHHMM(start, s.durationMin));
  };

  const setStartAndSyncEnd = (start: string) => {
    setTaskStartTime(start);
    setTaskEndTime(addMinutesToHHMM(start || nowHHMM(), taskDurationMin));
  };

  const setDurationAndSyncEnd = (minutes: number) => {
    setTaskDurationMin(minutes);
    const start = taskStartTime || nowHHMM();
    if (!taskStartTime) setTaskStartTime(start);
    setTaskEndTime(addMinutesToHHMM(start, minutes));
  };

  const toggleTask = (id: string) =>
    setData((prev) => ({
      ...prev,
      dailySchedule: prev.dailySchedule.map((b) => {
        if (b.id !== id) return b;
        const nextDone = !b.isCompleted;
        return {
          ...b,
          isCompleted: nextDone,
          completedAt: nextDone ? TODAY : undefined,
        };
      }),
    }));

  const deleteTask = (id: string) =>
    setData(prev => ({ ...prev, dailySchedule: prev.dailySchedule.filter(b => b.id !== id) }));

  const addTask = () => {
    if (!newTaskTitle.trim()) {
      toast.error("Pick a suggestion or write a task name", { position: "top-center", duration: 2000 });
      return;
    }
    const start = taskStartTime || nowHHMM();
    const end = taskEndTime || addMinutesToHHMM(start, taskDurationMin);
    setData((prev) => ({
      ...prev,
      dailySchedule: [
        ...prev.dailySchedule,
        {
          id: Date.now().toString(),
          title: newTaskTitle.trim(),
          startTime: start,
          endTime: end,
          type: taskType,
          description: "Custom task",
          isCompleted: false,
          canSkip: true,
          ...(selectedTemplate ? { templateKey: selectedTemplate } : {}),
        },
      ],
    }));
    setNewTaskTitle("");
    setTaskType("work");
    setTaskDurationMin(30);
    // Keep start at previous end so next task continues the day easily
    setTaskStartTime(end);
    setTaskEndTime(addMinutesToHHMM(end, 30));
    toast.success("Schedule added", { position: "top-center", duration: 2000 });
  };

  // ── Habits ──────────────────────────────────────────────────────────────────
  const addHabit = useCallback((habit: Omit<Habit, 'id' | 'currentStreak' | 'longestStreak' | 'completedDates' | 'createdAt'>) => {
    setData(prev => ({
      ...prev,
      habits: [...prev.habits, { ...habit, id: Date.now().toString(), currentStreak: 0, longestStreak: 0, completedDates: [], createdAt: new Date().toISOString() }],
    }));
  }, []);

  const toggleHabit = useCallback((habitId: string, date: string) => {
    setData(prev => ({
      ...prev,
      habits: prev.habits.map(h => {
        if (h.id !== habitId) return h;
        const already = h.completedDates.includes(date);
        const completedDates = already ? h.completedDates.filter(d => d !== date) : [...h.completedDates, date];
        const { current, longest } = computeStreaks(completedDates);
        return {
          ...h,
          completedDates,
          currentStreak: current,
          longestStreak: Math.max(longest, h.longestStreak || 0),
        };
      }),
    }));
  }, []);

  const deleteHabit = useCallback((habitId: string) =>
    setData(prev => ({ ...prev, habits: prev.habits.filter(h => h.id !== habitId) })), []);

  const editHabit = useCallback((habitId: string, updates: Partial<Habit>) =>
    setData(prev => ({ ...prev, habits: prev.habits.map(h => h.id === habitId ? { ...h, ...updates } : h) })), []);

  // ── Goals ───────────────────────────────────────────────────────────────────
  const addGoal = useCallback((goal: Goal) =>
    setData(prev => ({ ...prev, goals: [...prev.goals, goal] })), []);

  const updateGoal = useCallback((goal: Goal) =>
    setData(prev => ({ ...prev, goals: prev.goals.map(g => g.id === goal.id ? goal : g) })), []);

  const deleteGoal = useCallback((goalId: string) =>
    setData(prev => ({ ...prev, goals: prev.goals.filter(g => g.id !== goalId) })), []);

  const toggleMilestone = useCallback((goalId: string, milestoneId: string) =>
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id !== goalId ? g : {
        ...g,
        milestones: (g.milestones ?? []).map(m => m.id !== milestoneId ? m : {
          ...m, isCompleted: !m.isCompleted, completedAt: !m.isCompleted ? new Date().toISOString() : undefined,
        }),
      }),
    })), []);

  const addMilestone = useCallback((goalId: string, milestone: GoalMilestone) =>
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === goalId ? { ...g, milestones: [...(g.milestones ?? []), milestone] } : g),
    })), []);

  // ── Pomodoro ────────────────────────────────────────────────────────────────
  const updatePomodoroSettings = useCallback((settings: PomodoroSettings) =>
    setData(prev => ({ ...prev, pomodoroSettings: settings })), []);

  const completeSession = useCallback((session: Omit<PomodoroSession, 'id'>) =>
    setData(prev => ({ ...prev, pomodoroHistory: [...prev.pomodoroHistory, { ...session, id: Date.now().toString() }] })), []);

  // ── Mood ────────────────────────────────────────────────────────────────────
  const addMood = useCallback((mood: Omit<MoodEntry, 'id'>) =>
    setData(prev => ({ ...prev, moodHistory: [...prev.moodHistory, { ...mood, id: Date.now().toString() }] })), []);

  const updateMood = useCallback((moodId: string, updates: Partial<MoodEntry>) =>
    setData(prev => ({ ...prev, moodHistory: prev.moodHistory.map(m => m.id === moodId ? { ...m, ...updates } : m) })), []);

  // ── Journal ─────────────────────────────────────────────────────────────────
  const addJournalEntry = useCallback((entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    setData(prev => ({ ...prev, journal: [...prev.journal, { ...entry, id: Date.now().toString(), createdAt: now, updatedAt: now }] }));
  }, []);

  const updateJournalEntry = useCallback((entryId: string, updates: Partial<JournalEntry>) =>
    setData(prev => ({
      ...prev,
      journal: prev.journal.map(e => e.id === entryId ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e),
    })), []);

  const deleteJournalEntry = useCallback((entryId: string) =>
    setData(prev => ({ ...prev, journal: prev.journal.filter(e => e.id !== entryId) })), []);

  // ── Calendar ────────────────────────────────────────────────────────────────
  const addCalendarEvent = useCallback((event: Omit<CalendarEvent, 'id'>) =>
    setData(prev => ({ ...prev, calendarEvents: [...prev.calendarEvents, { ...event, id: Date.now().toString() }] })), []);

  // ── Render Schedule Tab ──────────────────────────────────────────────────────
  const renderScheduleTab = () => (
    <div className="space-y-6">
      {/* Quick Templates - filters only */}
      <div>
        <h3 className="font-semibold text-foreground mb-3 text-base">Quick Templates</h3>
        <p className="text-[11px] text-muted-foreground mb-3">
          No selection shows all schedules. Click a template to filter — click again for all.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {TEMPLATE_LIST.map(({ key, emoji }) => {
            const meta = TEMPLATE_META[key];
            return (
              <Button
                key={key}
                onClick={() => applyTemplate(key)}
                variant={selectedTemplate === key ? "default" : "outline"}
                className={cn(
                  "flex-col gap-2 h-auto py-4 px-3 border border-border rounded-lg transition-all hover:border-foreground",
                  selectedTemplate === key
                    ? "bg-white text-black"
                    : "bg-black text-foreground hover:bg-muted/10",
                )}
              >
                <span className="text-2xl">{emoji}</span>
                <span className="text-xs font-medium">{meta?.name}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Day plan list */}
      {visibleSchedule.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-foreground text-base">
              {selectedTemplate
                ? `${TEMPLATE_META[selectedTemplate]?.name || "Template"} schedule`
                : "All schedules"}
            </h3>
            <span className="text-xs font-semibold bg-muted/20 px-3 py-1 rounded-full">
              {completed}/{total}
            </span>
          </div>

          <div className="mb-3">
            <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${productivityScore}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {productivityScore}% of today's plan complete
            </p>
          </div>

          <Card className="border-border bg-black">
            <CardContent className="p-0">
              <ScrollArea className="h-[350px]">
                <div className="space-y-1.5 p-3">
                  {visibleSchedule.map((block) => {
                    const active =
                      !block.isCompleted && isHappeningNow(block.startTime, block.endTime);
                    return (
                      <div
                        key={block.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleTask(block.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleTask(block.id);
                          }
                        }}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-md border transition-all bg-black cursor-pointer select-none",
                          active
                            ? "border-green-500/60 bg-green-500/5"
                            : "border-border/50 hover:border-border hover:bg-muted/30",
                        )}
                      >
                        <span className="h-5 w-5 shrink-0 flex items-center justify-center">
                          {block.isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className={cn(
                                "text-xs font-medium",
                                block.isCompleted
                                  ? "line-through text-muted-foreground"
                                  : "text-foreground",
                              )}
                            >
                              {block.title}
                            </p>
                            {active && (
                              <span className="text-[9px] font-bold uppercase tracking-wide text-green-500 bg-green-500/15 px-1.5 py-0.5 rounded-full animate-pulse">
                                Now
                              </span>
                            )}
                            {!selectedTemplate &&
                              block.templateKey &&
                              TEMPLATE_META[block.templateKey] && (
                                <span className="text-[9px] uppercase tracking-wide text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded-full">
                                  {TEMPLATE_META[block.templateKey].name}
                                </span>
                              )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {block.startTime} – {block.endTime}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTask(block.id);
                            }}
                            title="Delete"
                          >
                            <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {selectedTemplate
              ? `No ${TEMPLATE_META[selectedTemplate]?.name || ""} tasks yet — add one below.`
              : "No schedules yet — pick a suggestion or write your own below."}
          </p>
        </div>
      )}

      {/* Add schedule — suggestions + easy time */}
      <Card className="border border-border bg-black">
        <CardContent className="p-4">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Choose an activity or write your own
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ACTIVITY_SUGGESTIONS.map((s) => {
                  const active = newTaskTitle === s.title;
                  return (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => pickSuggestion(s)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                        active
                          ? "border-foreground bg-white text-black"
                          : "border-border bg-muted/10 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                      )}
                    >
                      {s.title}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 items-center">
              <Input
                placeholder="Or type a custom schedule…"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                className="text-sm flex-1 bg-muted/10 border-border text-foreground placeholder:text-muted-foreground"
              />
              <Button
                size="sm"
                onClick={addTask}
                className="shrink-0 bg-white text-black hover:bg-gray-200 h-10 px-4"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground font-medium">Time</label>
                <button
                  type="button"
                  onClick={() => setStartAndSyncEnd(nowHHMM())}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  Start now
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground">Start</span>
                  <Input
                    type="time"
                    value={taskStartTime}
                    onChange={(e) => setStartAndSyncEnd(e.target.value)}
                    className="text-xs h-9 bg-muted/10 border-border text-foreground"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground">End</span>
                  <Input
                    type="time"
                    value={taskEndTime}
                    onChange={(e) => setTaskEndTime(e.target.value)}
                    className="text-xs h-9 bg-muted/10 border-border text-foreground"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setDurationAndSyncEnd(d.minutes)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-[11px] transition-colors",
                      taskDurationMin === d.minutes
                        ? "border-foreground bg-white text-black"
                        : "border-border bg-muted/10 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total", value: total, color: "" },
          { label: "Done", value: completed, color: "text-green-500" },
          { label: "Score", value: `${productivityScore}%`, color: "" },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center p-3 border border-border rounded-lg bg-black">
            <p className={cn("text-lg font-bold", color)}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Sync tab (export / import / clear) ───────────────────────────────────────
  const syncFileRef = useRef<HTMLInputElement>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const dataCounts = useMemo(() => ({
    tasks: schedule.length,
    habits: data.habits.length,
    goals: data.goals.length,
    journals: data.journal.length,
    moods: data.moodHistory.length,
    sessions: data.pomodoroHistory.length,
  }), [schedule.length, data.habits.length, data.goals.length, data.journal.length, data.moodHistory.length, data.pomodoroHistory.length]);

  const exportData = () => {
    const payload = { version: '2.0', app: 'Stabee Productivity Planner', exportDate: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planner-backup-${TODAY}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Backup exported');
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const imported = parsed.data ?? parsed;
        if (!imported || typeof imported !== 'object' || !Array.isArray(imported.dailySchedule)) {
          throw new Error('Unrecognized backup file');
        }
        setData(imported as ExtendedDailyLifeData);
        toast.success('Backup imported successfully');
      } catch {
        toast.error('Invalid backup file');
      }
      if (syncFileRef.current) syncFileRef.current.value = '';
    };
    reader.onerror = () => toast.error('Could not read file');
    reader.readAsText(file);
  };

  const clearData = () => {
    setData({
      gymSchedules: [], hygieneRoutines: [], mealPlans: [], mentalHealthSchedules: [],
      workBlocks: [], dailySchedule: [], preferences: {}, habits: [], goals: [],
      pomodoroSettings: DEFAULT_POMODORO_SETTINGS, pomodoroHistory: [], calendarEvents: [],
      analytics: [], moodHistory: [], journal: [], aiCoachingHistory: [],
    });
    setSelectedTemplate('');
    setShowClearConfirm(false);
    toast.success('All planner data cleared');
  };

  const renderSyncTab = () => (
    <div className="space-y-4 max-w-lg">
      {/* Storage overview */}
      <Card className="border-border bg-black">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium text-foreground">Your Planner Data</span>
            </div>
            <span className={cn(
              "flex items-center gap-1 text-xs px-2 py-1 rounded-full",
              isConnected ? "bg-green-500/15 text-green-500" : "bg-muted/30 text-muted-foreground"
            )}>
              <Check className="h-3 w-3" />
              {isConnected ? 'Backend synced' : 'Local only'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(dataCounts).map(([k, v]) => (
              <div key={k} className="text-center p-2 border border-border rounded-lg">
                <p className="text-lg font-bold text-foreground">{v}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{k}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="space-y-2">
        <Button className="w-full bg-white text-black hover:bg-gray-200" onClick={exportData}>
          <Download className="h-4 w-4 mr-2" /> Export Backup (.json)
        </Button>
        <input ref={syncFileRef} type="file" accept=".json" onChange={importData} className="hidden" />
        <Button variant="outline" className="w-full" onClick={() => syncFileRef.current?.click()}>
          <Upload className="h-4 w-4 mr-2" /> Import from Backup
        </Button>
      </div>

      {/* Privacy */}
      <div className="p-3 border border-border rounded-lg bg-muted/10">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Privacy</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Your planner data lives on this device{isConnected ? ' and syncs to your backend' : ''}.
          Export a backup regularly so you never lose your progress.
        </p>
      </div>

      {/* Danger zone */}
      <div className="p-4 border border-red-500/30 rounded-lg bg-red-500/5">
        <div className="flex items-center gap-2 mb-3">
          <Trash2 className="h-4 w-4 text-red-500" />
          <span className="text-sm font-medium text-red-500">Danger Zone</span>
        </div>
        {showClearConfirm ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              This permanently deletes all schedules, habits, goals, journals, moods and stats. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={clearData}>Yes, delete everything</Button>
              <Button variant="outline" size="sm" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="text-red-500 border-red-500/30 hover:bg-red-500/10"
            onClick={() => setShowClearConfirm(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Clear all data
          </Button>
        )}
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'schedule':  return renderScheduleTab();
      case 'habits':    return <HabitTracker habits={data.habits} onAddHabit={addHabit} onToggleHabit={toggleHabit} onDeleteHabit={deleteHabit} onEditHabit={editHabit} />;
      case 'focus':     return <PomodoroTimer settings={data.pomodoroSettings} sessions={data.pomodoroHistory} onSettingsChange={updatePomodoroSettings} onSessionComplete={completeSession} />;
      case 'goals':     return <GoalTracker goals={data.goals} onAddGoal={addGoal} onUpdateGoal={updateGoal} onDeleteGoal={deleteGoal} onToggleMilestone={toggleMilestone} onAddMilestone={addMilestone} />;
      case 'calendar':  return <ProductivityCalendar events={data.calendarEvents} scheduleBlocks={schedule} onAddEvent={addCalendarEvent} />;
      case 'mood':      return <MoodTracker moods={data.moodHistory} onAddMood={addMood} onUpdateMood={updateMood} />;
      case 'journal':   return <DailyJournal entries={data.journal} onAddEntry={addJournalEntry} onUpdateEntry={updateJournalEntry} onDeleteEntry={deleteJournalEntry} />;
      case 'stats':     return <ProductivityAnalytics dailyStats={analyticsForDisplay} weeklyAnalytics={weeklyAnalytics} />;
      case 'review':    return (
        <WeeklyReview
          dailyStats={analyticsForDisplay}
          weeklyAnalytics={weeklyAnalytics}
          habits={data.habits}
          goals={data.goals}
          journalEntries={data.journal}
          moods={data.moodHistory}
          schedule={data.dailySchedule}
        />
      );
      case 'sync':      return renderSyncTab();
    }
  };

  return (
    <div className="w-full h-full bg-black flex flex-col">
      {/* Header - Font size matches Finance Manager (text-lg) */}
      <div className="px-6 py-4 border-b border-border bg-black">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-lg text-foreground">Productivity Planner</h2>
            <p className="text-xs text-muted-foreground">
              {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg bg-muted/30">
              <TrendingUp className="h-4 w-4 text-foreground" />
              <span className="text-xs text-muted-foreground">Score</span>
              <span className="text-sm font-bold text-foreground">{productivityScore}%</span>
            </div>
            {selectedTemplate && (
              <span className="text-[11px] text-muted-foreground px-2 py-1 rounded-lg border border-border bg-muted/20">
                Filter: {TEMPLATE_META[selectedTemplate]?.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border bg-black overflow-x-auto">
        <div className="flex px-4 min-w-full">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex flex-col items-center gap-1 py-3 px-3 transition-all border-b-2 text-xs font-medium whitespace-nowrap',
                activeTab === id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-6 py-4 max-w-4xl">
            {renderContent()}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default DailyLifePlannerEnhanced;
