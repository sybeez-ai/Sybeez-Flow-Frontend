export interface GymSchedule {
  id: string;
  time: string; // HH:MM format
  duration: number; // minutes
  days: number[]; // 0-6 (Sunday-Saturday)
  workoutType?: string;
  restDays?: number[];
  streak: number;
  missedDays: number;
  reminderMinutes: number;
}

export interface HygieneRoutine {
  id: string;
  name: string;
  type: 'morning' | 'evening' | 'night';
  time?: string;
  duration: number;
  activities: string[];
  isCompleted: boolean;
  streak: number;
}

export interface MealPlan {
  id: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  time: string;
  preferredFoods?: string[];
  dietType?: 'veg' | 'non-veg' | 'vegan' | 'keto' | 'balanced';
  calorieGoal?: number;
  waterReminder?: boolean;
  cheatMealDay?: number; // Day of week
}

export interface MentalHealthSchedule {
  id: string;
  type: 'break' | 'meditation' | 'relaxation' | 'sleep';
  time: string;
  duration: number;
  activity?: string;
  reminderEnabled: boolean;
}

export interface WorkBlock {
  id: string;
  title: string;
  type: 'focus' | 'meeting' | 'study' | 'deadline';
  startTime: string;
  endTime: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  isRecurring: boolean;
  days?: number[];
  breaks?: { duration: number; frequency: number }; // break duration and every X minutes
}

export interface SleepSchedule {
  id: string;
  bedTime: string;
  wakeTime: string;
  targetHours: number;
  windDownTime: string; // Time before bed to start winding down
  reminderEnabled: boolean;
}

export interface DailyScheduleBlock {
  id: string;
  type: 'hygiene' | 'gym' | 'meal' | 'work' | 'break' | 'sleep' | 'free';
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
  isCompleted: boolean;
  canSkip: boolean;
  /** Which Quick Template this block belongs to (empty = custom / all). */
  templateKey?: string;
  /** YYYY-MM-DD when the task was marked done. */
  completedAt?: string;
  /** Linked goal for progress / daily reports */
  goalId?: string;
  /** Calendar date this block is for (YYYY-MM-DD). Defaults to today when missing. */
  date?: string;
}

export interface DailyLifeData {
  gymSchedules: GymSchedule[];
  hygieneRoutines: HygieneRoutine[];
  mealPlans: MealPlan[];
  mentalHealthSchedules: MentalHealthSchedule[];
  workBlocks: WorkBlock[];
  sleepSchedule?: SleepSchedule;
  dailySchedule: DailyScheduleBlock[]; // Auto-generated daily schedule
  preferences: {
    wakeUpTime?: string;
    sleepTime?: string;
    workStartTime?: string;
    workEndTime?: string;
    gymPreference?: 'morning' | 'evening';
    dietPreference?: 'veg' | 'non-veg' | 'vegan';
  };
}

export interface LifePlanMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  type?: "text" | "schedule" | "insight" | "reminder";
  data?: any;
}

// ============ HABIT TRACKING ============
export interface Habit {
  id: string;
  name: string;
  icon: string;
  category: 'health' | 'productivity' | 'learning' | 'mindfulness' | 'fitness' | 'custom';
  frequency: 'daily' | 'weekly' | 'custom';
  targetDays?: number[]; // 0-6 for custom frequency
  currentStreak: number;
  longestStreak: number;
  completedDates: string[]; // ISO date strings
  createdAt: string;
  color?: string;
  reminderTime?: string;
  notes?: string;
}

export interface HabitLog {
  habitId: string;
  date: string;
  completed: boolean;
  note?: string;
}

// ============ GOALS ============
export interface GoalProgressLog {
  id: string;
  date: string; // YYYY-MM-DD
  delta: number;
  note?: string;
  source: 'manual' | 'milestone' | 'schedule' | 'ai';
  milestoneId?: string;
  scheduleBlockId?: string;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  category: 'career' | 'health' | 'learning' | 'finance' | 'personal' | 'fitness';
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  targetValue: number;
  currentValue: number;
  unit: string;
  startDate: string;
  endDate: string;
  milestones?: GoalMilestone[];
  /** Date-wise progress history */
  progressLogs?: GoalProgressLog[];
  isCompleted: boolean;
  color?: string;
}

export interface GoalMilestone {
  id: string;
  title: string;
  targetValue: number;
  isCompleted: boolean;
  completedAt?: string;
}

// ============ POMODORO ============
export interface PomodoroSession {
  id: string;
  taskId?: string;
  taskTitle: string;
  duration: number; // minutes
  type: 'work' | 'shortBreak' | 'longBreak';
  startedAt: string;
  completedAt?: string;
  isCompleted: boolean;
}

export interface PomodoroSettings {
  workDuration: number; // default 25
  shortBreakDuration: number; // default 5
  longBreakDuration: number; // default 15
  sessionsBeforeLongBreak: number; // default 4
  autoStartBreaks: boolean;
  autoStartPomodoros: boolean;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

// ============ CALENDAR ============
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  date: string;
  isAllDay: boolean;
  category: 'work' | 'personal' | 'health' | 'social' | 'other';
  color?: string;
  isRecurring: boolean;
  recurringPattern?: 'daily' | 'weekly' | 'monthly';
  source: 'manual' | 'google' | 'microsoft' | 'schedule';
}

// ============ ANALYTICS ============
export interface DailyStats {
  date: string;
  tasksCompleted: number;
  totalTasks: number;
  productivityScore: number;
  focusTime: number; // minutes
  pomodorosCompleted: number;
  habitsCompleted: number;
  totalHabits: number;
  waterIntake: number;
  caloriesConsumed: number;
  sleepHours?: number;
  moodScore?: number; // 1-5
}

export interface WeeklyAnalytics {
  weekStart: string;
  weekEnd: string;
  dailyStats: DailyStats[];
  avgProductivityScore: number;
  totalFocusTime: number;
  totalPomodorosCompleted: number;
  habitCompletionRate: number;
  topHabits: { habitId: string; completionRate: number }[];
  productivityTrend: 'improving' | 'stable' | 'declining';
}

// ============ MOOD TRACKING ============
export interface MoodEntry {
  id: string;
  date: string;
  time: string;
  mood: 1 | 2 | 3 | 4 | 5;
  moodLabel: 'terrible' | 'bad' | 'okay' | 'good' | 'great';
  note?: string;
  factors?: string[]; // sleep, exercise, work, social, etc.
}

// ============ JOURNAL ============
export interface JournalEntry {
  id: string;
  date: string;
  title?: string;
  content: string;
  mood?: number;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

// ============ AI COACHING ============
export interface AICoachingMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  type: 'chat' | 'suggestion' | 'insight' | 'motivation' | 'schedule';
  metadata?: {
    taskSuggestions?: string[];
    scheduleSuggestion?: DailyScheduleBlock[];
    habitRecommendations?: string[];
    productivityTips?: string[];
  };
}

export interface AICoachingContext {
  currentTasks: { title: string; completed: boolean }[];
  todaySchedule: DailyScheduleBlock[];
  habits: Habit[];
  recentMoods: MoodEntry[];
  weeklyStats: WeeklyAnalytics | null;
  goals: Goal[];
  preferences: {
    wakeUpTime?: string;
    sleepTime?: string;
    workStyle?: 'early-bird' | 'night-owl' | 'balanced';
    focusPreference?: 'pomodoro' | 'deep-work' | 'flexible';
  };
}

// ============ EXTENDED DATA ============
export interface ExtendedDailyLifeData extends DailyLifeData {
  habits: Habit[];
  goals: Goal[];
  pomodoroSettings: PomodoroSettings;
  pomodoroHistory: PomodoroSession[];
  calendarEvents: CalendarEvent[];
  analytics: DailyStats[];
  moodHistory: MoodEntry[];
  journal: JournalEntry[];
  aiCoachingHistory: AICoachingMessage[];
}
