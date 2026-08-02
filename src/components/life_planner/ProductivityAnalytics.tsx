/**
 * Productivity Analytics Dashboard
 * Visual charts and insights for tracking progress
 */

import { useMemo } from "react";
import { 
  TrendingUp, 
  TrendingDown,
  Minus,
  Target,
  Brain,
  Flame,
  Trophy,
  Calendar,
  Clock,
  Zap,
  Activity
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DailyStats, WeeklyAnalytics } from "@/types/dailyLife";
import { cn } from "@/lib/utils";
import { localISODay, shiftLocalDay } from "@/utils/dateUtils";

interface ProductivityAnalyticsProps {
  dailyStats: DailyStats[];
  weeklyAnalytics: WeeklyAnalytics | null;
}

const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const ProductivityAnalytics = ({ dailyStats, weeklyAnalytics }: ProductivityAnalyticsProps) => {
  // Get last 7 days stats
  const last7DaysStats = useMemo(() => {
    const today = localISODay();
    const dates = Array.from({ length: 7 }, (_, i) => shiftLocalDay(today, -(6 - i)));
    
    return dates.map(date => {
      const stat = dailyStats.find(s => s.date === date);
      return stat || {
        date,
        tasksCompleted: 0,
        totalTasks: 0,
        productivityScore: 0,
        focusTime: 0,
        pomodorosCompleted: 0,
        habitsCompleted: 0,
        totalHabits: 0,
        waterIntake: 0,
        caloriesConsumed: 0
      };
    });
  }, [dailyStats]);

  // Calculate averages
  const avgProductivity = useMemo(() => {
    const validDays = last7DaysStats.filter(s => s.totalTasks > 0);
    if (validDays.length === 0) return 0;
    return Math.round(validDays.reduce((acc, s) => acc + s.productivityScore, 0) / validDays.length);
  }, [last7DaysStats]);

  const totalFocusTime = useMemo(() => {
    return last7DaysStats.reduce((acc, s) => acc + s.focusTime, 0);
  }, [last7DaysStats]);

  const totalPomodoros = useMemo(() => {
    return last7DaysStats.reduce((acc, s) => acc + s.pomodorosCompleted, 0);
  }, [last7DaysStats]);

  const habitCompletionRate = useMemo(() => {
    const totalCompleted = last7DaysStats.reduce((acc, s) => acc + s.habitsCompleted, 0);
    const totalHabits = last7DaysStats.reduce((acc, s) => acc + s.totalHabits, 0);
    if (totalHabits === 0) return 0;
    return Math.round((totalCompleted / totalHabits) * 100);
  }, [last7DaysStats]);

  // Trend calculation
  const getTrend = (): { direction: 'up' | 'down' | 'stable'; percentage: number } => {
    const firstHalf = last7DaysStats.slice(0, 3);
    const secondHalf = last7DaysStats.slice(4);
    
    const firstAvg = firstHalf.reduce((acc, s) => acc + s.productivityScore, 0) / 3;
    const secondAvg = secondHalf.reduce((acc, s) => acc + s.productivityScore, 0) / 3;
    
    const diff = secondAvg - firstAvg;
    if (Math.abs(diff) < 5) return { direction: 'stable', percentage: 0 };
    return {
      direction: diff > 0 ? 'up' : 'down',
      percentage: Math.abs(Math.round(diff))
    };
  };

  const trend = getTrend();

  // Get max value for chart scaling
  const maxProductivity = Math.max(...last7DaysStats.map(s => s.productivityScore), 1);

  // Today's stats
  const today = localISODay();
  const todayStats = dailyStats.find(s => s.date === today);

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 border border-border rounded-lg bg-gradient-to-br from-blue-500/10 to-transparent">
          <div className="flex items-center justify-between mb-2">
            <Brain className="h-4 w-4 text-blue-500" />
            <Badge variant="outline" className={cn(
              "text-[10px]",
              trend.direction === 'up' ? "text-green-500 border-green-500" :
              trend.direction === 'down' ? "text-red-500 border-red-500" :
              "text-gray-500"
            )}>
              {trend.direction === 'up' && <TrendingUp className="h-3 w-3 mr-0.5" />}
              {trend.direction === 'down' && <TrendingDown className="h-3 w-3 mr-0.5" />}
              {trend.direction === 'stable' && <Minus className="h-3 w-3 mr-0.5" />}
              {trend.percentage}%
            </Badge>
          </div>
          <p className="text-2xl font-bold text-foreground">{avgProductivity}%</p>
          <p className="text-[10px] text-muted-foreground">Avg Productivity</p>
        </div>
        
        <div className="p-3 border border-border rounded-lg bg-gradient-to-br from-orange-500/10 to-transparent">
          <div className="flex items-center justify-between mb-2">
            <Flame className="h-4 w-4 text-orange-500" />
            <Badge variant="outline" className="text-[10px]">
              {habitCompletionRate}%
            </Badge>
          </div>
          <p className="text-2xl font-bold text-foreground">{habitCompletionRate}%</p>
          <p className="text-[10px] text-muted-foreground">Habit Completion</p>
        </div>
        
        <div className="p-3 border border-border rounded-lg bg-gradient-to-br from-green-500/10 to-transparent">
          <div className="flex items-center justify-between mb-2">
            <Clock className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-foreground">{Math.round(totalFocusTime / 60)}h</p>
          <p className="text-[10px] text-muted-foreground">Focus Time (7d)</p>
        </div>
        
        <div className="p-3 border border-border rounded-lg bg-gradient-to-br from-red-500/10 to-transparent">
          <div className="flex items-center justify-between mb-2">
            <Target className="h-4 w-4 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-foreground">{totalPomodoros}</p>
          <p className="text-[10px] text-muted-foreground">Pomodoros (7d)</p>
        </div>
      </div>

      {/* Productivity Chart */}
      <div className="p-3 border border-border rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-foreground" />
            <span className="text-xs font-medium text-foreground">7-Day Productivity</span>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {weeklyAnalytics?.productivityTrend || 'stable'}
          </Badge>
        </div>
        
        {/* Bar chart */}
        <div className="flex items-end justify-between gap-1 h-[100px]">
          {last7DaysStats.map((stat, i) => {
            const date = new Date(stat.date);
            const isToday = stat.date === today;
            const height = maxProductivity > 0 
              ? (stat.productivityScore / 100) * 100 
              : 0;
            
            return (
              <div key={stat.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative flex-1 flex items-end">
                  <div
                    className={cn(
                      "w-full rounded-t transition-all",
                      isToday ? "bg-foreground" : "bg-foreground/40",
                      stat.productivityScore === 0 && "bg-muted"
                    )}
                    style={{ height: `${Math.max(height, 4)}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{DAYS_SHORT[date.getDay()]}</span>
                <span className="text-[9px] font-medium text-foreground">{stat.productivityScore}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Completion Stats */}
      <div className="p-3 border border-border rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-foreground" />
          <span className="text-xs font-medium text-foreground">Task Completion</span>
        </div>
        
        <div className="space-y-2">
          {last7DaysStats.slice().reverse().slice(0, 5).map(stat => {
            const date = new Date(stat.date);
            const percentage = stat.totalTasks > 0 
              ? Math.round((stat.tasksCompleted / stat.totalTasks) * 100)
              : 0;
            
            return (
              <div key={stat.date} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-16">
                  {date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                </span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full transition-all",
                      percentage >= 80 ? "bg-green-500" :
                      percentage >= 50 ? "bg-yellow-500" :
                      "bg-red-500"
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium text-foreground w-8 text-right">
                  {stat.tasksCompleted}/{stat.totalTasks}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Focus Time Breakdown */}
      <div className="p-3 border border-border rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-4 w-4 text-foreground" />
          <span className="text-xs font-medium text-foreground">Focus Time Breakdown</span>
        </div>
        
        <div className="flex items-end justify-between gap-1 h-[60px]">
          {last7DaysStats.map((stat, i) => {
            const date = new Date(stat.date);
            const hours = stat.focusTime / 60;
            const maxHours = Math.max(...last7DaysStats.map(s => s.focusTime / 60), 1);
            const height = (hours / maxHours) * 100;
            
            return (
              <div key={stat.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative flex-1 flex items-end">
                  <div
                    className={cn(
                      "w-full rounded-t transition-all bg-green-500/60",
                      stat.focusTime === 0 && "bg-muted"
                    )}
                    style={{ height: `${Math.max(height, 4)}%` }}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground">{hours.toFixed(1)}h</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Today's Summary */}
      {todayStats && (
        <div className="p-3 border border-border rounded-lg bg-muted/20">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-foreground" />
            <span className="text-xs font-medium text-foreground">Today's Summary</span>
          </div>
          
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-sm font-bold text-foreground">{todayStats.tasksCompleted}</p>
              <p className="text-[9px] text-muted-foreground">Tasks</p>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{todayStats.pomodorosCompleted}</p>
              <p className="text-[9px] text-muted-foreground">Pomodoros</p>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{todayStats.habitsCompleted}</p>
              <p className="text-[9px] text-muted-foreground">Habits</p>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{Math.round(todayStats.focusTime / 60)}h</p>
              <p className="text-[9px] text-muted-foreground">Focus</p>
            </div>
          </div>
        </div>
      )}

      {/* Insights */}
      <div className="space-y-2">
        {avgProductivity >= 80 && (
          <div className="p-2 border border-green-500/30 rounded-lg bg-green-500/5 flex items-start gap-2">
            <Trophy className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            <p className="text-xs text-green-600">
              🎉 Outstanding week! Your {avgProductivity}% productivity puts you in the top tier.
            </p>
          </div>
        )}
        
        {trend.direction === 'up' && trend.percentage > 10 && (
          <div className="p-2 border border-blue-500/30 rounded-lg bg-blue-500/5 flex items-start gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-600">
              📈 Great momentum! Your productivity is up {trend.percentage}% compared to last week.
            </p>
          </div>
        )}
        
        {habitCompletionRate < 50 && (
          <div className="p-2 border border-yellow-500/30 rounded-lg bg-yellow-500/5 flex items-start gap-2">
            <Flame className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-600">
              💡 Tip: Focus on completing just 2-3 core habits daily to build momentum.
            </p>
          </div>
        )}
        
        {totalFocusTime < 300 && (
          <div className="p-2 border border-orange-500/30 rounded-lg bg-orange-500/5 flex items-start gap-2">
            <Brain className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
            <p className="text-xs text-orange-600">
              ⏱️ Try adding 1-2 Pomodoro sessions daily to increase your focus time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductivityAnalytics;
