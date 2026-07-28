/**
 * Habit Tracker Component
 * Track daily habits with streaks and visual progress
 */

import { useState } from "react";
import { 
  Flame, 
  Plus, 
  Check, 
  X, 
  Trophy,
  Target,
  Trash2,
  Edit2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Habit } from "@/types/dailyLife";
import { cn } from "@/lib/utils";

interface HabitTrackerProps {
  habits: Habit[];
  onAddHabit: (habit: Omit<Habit, 'id' | 'currentStreak' | 'longestStreak' | 'completedDates' | 'createdAt'>) => void;
  onToggleHabit: (habitId: string, date: string) => void;
  onDeleteHabit: (habitId: string) => void;
  onEditHabit?: (habitId: string, updates: Partial<Habit>) => void;
}

const HABIT_ICONS = ['💪', '📚', '🧘', '💧', '🏃', '✍️', '🎯', '🌿', '😴', '🍎', '🧠', '💻', '🎨', '🎵', '🏋️', '🚶'];
const HABIT_CATEGORIES: Habit['category'][] = ['health', 'productivity', 'learning', 'mindfulness', 'fitness', 'custom'];

const CATEGORY_COLORS: Record<Habit['category'], string> = {
  health: 'bg-red-500',
  productivity: 'bg-blue-500',
  learning: 'bg-purple-500',
  mindfulness: 'bg-green-500',
  fitness: 'bg-orange-500',
  custom: 'bg-gray-500'
};

const HabitTracker = ({ 
  habits, 
  onAddHabit, 
  onToggleHabit, 
  onDeleteHabit,
  onEditHabit 
}: HabitTrackerProps) => {
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabit, setNewHabit] = useState({
    name: '',
    icon: '💪',
    category: 'health' as Habit['category'],
    frequency: 'daily' as Habit['frequency']
  });

  const today = new Date().toISOString().split('T')[0];
  
  // Get last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });

  // Check if habit is completed for a date
  const isCompletedForDate = (habit: Habit, date: string): boolean => {
    return habit.completedDates.includes(date);
  };

  // Calculate completion rate
  const getCompletionRate = (habit: Habit): number => {
    const completed = last7Days.filter(d => isCompletedForDate(habit, d)).length;
    return Math.round((completed / 7) * 100);
  };

  // Get streak status
  const getStreakStatus = (streak: number): { label: string; color: string } => {
    if (streak >= 30) return { label: 'On Fire!', color: 'text-orange-500' };
    if (streak >= 14) return { label: 'Great!', color: 'text-yellow-500' };
    if (streak >= 7) return { label: 'Good', color: 'text-green-500' };
    if (streak >= 3) return { label: 'Building', color: 'text-blue-500' };
    return { label: 'Start', color: 'text-muted-foreground' };
  };

  // Handle add habit
  const handleAddHabit = () => {
    if (!newHabit.name.trim()) return;
    
    onAddHabit({
      name: newHabit.name,
      icon: newHabit.icon,
      category: newHabit.category,
      frequency: newHabit.frequency
    });
    
    setNewHabit({ name: '', icon: '💪', category: 'health', frequency: 'daily' });
    setShowAddHabit(false);
  };

  // Calculate total stats
  const totalHabits = habits.length;
  const completedToday = habits.filter(h => isCompletedForDate(h, today)).length;
  const totalStreak = habits.reduce((acc, h) => acc + h.currentStreak, 0);
  const avgCompletionRate = habits.length > 0 
    ? Math.round(habits.reduce((acc, h) => acc + getCompletionRate(h), 0) / habits.length)
    : 0;

  return (
    <div className="space-y-3">
      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-2">
        <div className="text-center p-2 border border-border rounded-lg bg-muted/20">
          <p className="text-lg font-bold text-foreground">{completedToday}/{totalHabits}</p>
          <p className="text-[10px] text-muted-foreground">Today</p>
        </div>
        <div className="text-center p-2 border border-border rounded-lg bg-muted/20">
          <p className="text-lg font-bold text-foreground flex items-center justify-center gap-1">
            <Flame className="h-4 w-4 text-orange-500" />
            {totalStreak}
          </p>
          <p className="text-[10px] text-muted-foreground">Total Streak</p>
        </div>
        <div className="text-center p-2 border border-border rounded-lg bg-muted/20">
          <p className="text-lg font-bold text-foreground">{avgCompletionRate}%</p>
          <p className="text-[10px] text-muted-foreground">7-Day Rate</p>
        </div>
        <div className="text-center p-2 border border-border rounded-lg bg-muted/20">
          <p className="text-lg font-bold text-foreground flex items-center justify-center gap-1">
            <Trophy className="h-4 w-4 text-yellow-500" />
            {Math.max(...habits.map(h => h.longestStreak), 0)}
          </p>
          <p className="text-[10px] text-muted-foreground">Best Streak</p>
        </div>
      </div>

      {/* Add Habit Button/Form */}
      {!showAddHabit ? (
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full h-8 text-xs"
          onClick={() => setShowAddHabit(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add New Habit
        </Button>
      ) : (
        <div className="p-3 border border-border rounded-lg space-y-3 bg-muted/20">
          <Input
            placeholder="Habit name (e.g., Read 30 mins)..."
            value={newHabit.name}
            onChange={(e) => setNewHabit({ ...newHabit, name: e.target.value })}
            className="h-8 text-xs"
          />
          
          {/* Icon Selection */}
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Choose Icon</p>
            <div className="flex flex-wrap gap-1">
              {HABIT_ICONS.map(icon => (
                <button
                  key={icon}
                  onClick={() => setNewHabit({ ...newHabit, icon })}
                  className={cn(
                    "w-7 h-7 rounded border flex items-center justify-center transition-all",
                    newHabit.icon === icon 
                      ? "border-foreground bg-foreground/10" 
                      : "border-border hover:border-foreground/50"
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          
          {/* Category Selection */}
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Category</p>
            <div className="flex flex-wrap gap-1">
              {HABIT_CATEGORIES.map(cat => (
                <Button
                  key={cat}
                  variant={newHabit.category === cat ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setNewHabit({ ...newHabit, category: cat })}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>

          {/* Frequency Selection */}
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Frequency</p>
            <div className="flex gap-1">
              {(['daily', 'weekly', 'custom'] as const).map(freq => (
                <Button
                  key={freq}
                  variant={newHabit.frequency === freq ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 text-[10px] flex-1"
                  onClick={() => setNewHabit({ ...newHabit, frequency: freq })}
                >
                  {freq}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs flex-1" onClick={handleAddHabit}>
              <Plus className="h-3 w-3 mr-1" />
              Add Habit
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 text-xs"
              onClick={() => setShowAddHabit(false)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Habits List */}
      <div className="space-y-2">
        {habits.length > 0 ? (
          habits.map(habit => {
            const streakStatus = getStreakStatus(habit.currentStreak);
            const completionRate = getCompletionRate(habit);
            const isTodayCompleted = isCompletedForDate(habit, today);
            
            return (
              <div 
                key={habit.id} 
                className={cn(
                  "p-3 border rounded-lg transition-all",
                  isTodayCompleted 
                    ? "border-green-500/50 bg-green-500/5" 
                    : "border-border hover:border-foreground/30"
                )}
              >
                {/* Main row */}
                <div className="flex items-center gap-3">
                  {/* Today's toggle */}
                  <button
                    onClick={() => onToggleHabit(habit.id, today)}
                    className={cn(
                      "w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all shrink-0",
                      isTodayCompleted
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-border hover:border-foreground"
                    )}
                  >
                    {isTodayCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="text-lg">{habit.icon}</span>
                    )}
                  </button>
                  
                  {/* Habit info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        "text-xs font-medium",
                        isTodayCompleted ? "text-green-600 line-through" : "text-foreground"
                      )}>
                        {habit.name}
                      </p>
                      <Badge 
                        variant="outline" 
                        className={cn("text-[10px] px-1", CATEGORY_COLORS[habit.category], "text-white border-none")}
                      >
                        {habit.category}
                      </Badge>
                    </div>
                    
                    {/* Streak info */}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1">
                        <Flame className={cn("h-3 w-3", habit.currentStreak > 0 ? "text-orange-500" : "text-muted-foreground")} />
                        <span className="text-[11px] text-foreground font-medium">{habit.currentStreak}</span>
                        <span className={cn("text-[10px]", streakStatus.color)}>{streakStatus.label}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">|</span>
                      <span className="text-[10px] text-muted-foreground">{completionRate}% this week</span>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <button
                    onClick={() => onDeleteHabit(habit.id)}
                    className="p-1 hover:bg-red-500/10 rounded transition-colors"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-500" />
                  </button>
                </div>

                {/* 7-day history */}
                <div className="flex gap-1 mt-2 pt-2 border-t border-border/50">
                  {last7Days.map((date, i) => {
                    const isCompleted = isCompletedForDate(habit, date);
                    const dayLabel = new Date(date).toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
                    const isCurrentDay = date === today;
                    
                    return (
                      <button
                        key={date}
                        onClick={() => onToggleHabit(habit.id, date)}
                        className={cn(
                          "flex-1 py-1 rounded text-center transition-all",
                          isCompleted 
                            ? "bg-green-500 text-white" 
                            : "bg-muted/30 hover:bg-muted/50",
                          isCurrentDay && !isCompleted && "ring-1 ring-foreground"
                        )}
                      >
                        <p className="text-[10px]">{dayLabel}</p>
                        <p className="text-[10px] font-medium">
                          {new Date(date).getDate()}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs">No habits yet</p>
            <p className="text-[10px]">Add your first habit to start building streaks!</p>
          </div>
        )}
      </div>

      {/* Motivation */}
      {habits.length > 0 && avgCompletionRate >= 80 && (
        <div className="p-3 border border-green-500/30 rounded-lg bg-green-500/5">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-green-500" />
            <p className="text-xs font-medium text-green-600">
              🎉 Amazing! You're keeping up {avgCompletionRate}% of your habits!
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default HabitTracker;
