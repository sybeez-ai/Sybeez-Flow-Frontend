/**
 * Pomodoro Timer Component
 * Focus sessions with customizable work/break intervals
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Settings,
  Coffee,
  Brain,
  Volume2,
  VolumeX,
  Target,
  Zap,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PomodoroSettings, PomodoroSession } from "@/types/dailyLife";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { upsertNotification } from "@/services/notificationService";

interface PomodoroTimerProps {
  settings: PomodoroSettings;
  sessions: PomodoroSession[];
  currentTask?: string;
  onSettingsChange: (settings: PomodoroSettings) => void;
  onSessionComplete: (session: Omit<PomodoroSession, 'id'>) => void;
  onStartSession?: () => void;
}

type TimerMode = 'work' | 'shortBreak' | 'longBreak';

const PomodoroTimer = ({ 
  settings, 
  sessions, 
  currentTask,
  onSettingsChange, 
  onSessionComplete,
  onStartSession
}: PomodoroTimerProps) => {
  const [mode, setMode] = useState<TimerMode>('work');
  const [timeLeft, setTimeLeft] = useState(settings.workDuration * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedPomodoros, setCompletedPomodoros] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [taskTitle, setTaskTitle] = useState(currentTask || '');
  const [sessionStartTime, setSessionStartTime] = useState<string | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get duration for current mode
  const getDuration = useCallback((timerMode: TimerMode): number => {
    switch (timerMode) {
      case 'work': return settings.workDuration * 60;
      case 'shortBreak': return settings.shortBreakDuration * 60;
      case 'longBreak': return settings.longBreakDuration * 60;
    }
  }, [settings]);

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage
  const progress = ((getDuration(mode) - timeLeft) / getDuration(mode)) * 100;

  // Play notification sound
  const playSound = useCallback(() => {
    if (settings.soundEnabled && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [settings.soundEnabled]);

  // In-app inbox + browser alert (when tab is in background)
  const showNotification = useCallback((title: string, body: string) => {
    if (!settings.notificationsEnabled) return;
    upsertNotification({
      sourceKey: `focus:pomodoro:${Date.now()}`,
      module: "focus",
      title,
      body,
      target: "planner",
      severity: "info",
      toastOnce: false,
    });
  }, [settings.notificationsEnabled]);

  // Handle timer completion
  const handleTimerComplete = useCallback(() => {
    playSound();
    setIsRunning(false);
    
    if (mode === 'work') {
      // Save completed work session
      onSessionComplete({
        taskTitle: taskTitle || 'Focus Session',
        duration: settings.workDuration,
        type: 'work',
        startedAt: sessionStartTime || new Date().toISOString(),
        completedAt: new Date().toISOString(),
        isCompleted: true
      });
      
      const newCount = completedPomodoros + 1;
      setCompletedPomodoros(newCount);
      
      // Determine next break type
      const nextMode: TimerMode = newCount % settings.sessionsBeforeLongBreak === 0 ? 'longBreak' : 'shortBreak';
      
      showNotification(
        '🎉 Pomodoro Complete!', 
        `Time for a ${nextMode === 'longBreak' ? 'long' : 'short'} break!`
      );
      toast.success(`🎉 Pomodoro #${newCount} complete! Take a ${nextMode === 'longBreak' ? 'long' : 'short'} break.`);
      
      if (settings.autoStartBreaks) {
        setMode(nextMode);
        setTimeLeft(getDuration(nextMode));
        setIsRunning(true);
      } else {
        setMode(nextMode);
        setTimeLeft(getDuration(nextMode));
      }
    } else {
      // Break completed
      showNotification('☕ Break Over!', 'Ready to focus again?');
      toast.info('☕ Break over! Ready to focus?');
      
      if (settings.autoStartPomodoros) {
        setMode('work');
        setTimeLeft(getDuration('work'));
        setIsRunning(true);
        setSessionStartTime(new Date().toISOString());
      } else {
        setMode('work');
        setTimeLeft(getDuration('work'));
      }
    }
  }, [mode, completedPomodoros, settings, taskTitle, sessionStartTime, playSound, showNotification, onSessionComplete, getDuration]);

  // Timer effect
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      handleTimerComplete();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timeLeft, handleTimerComplete]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Update task title from props
  useEffect(() => {
    if (currentTask) {
      setTaskTitle(currentTask);
    }
  }, [currentTask]);

  // Start/pause timer
  const toggleTimer = () => {
    if (!isRunning && mode === 'work' && timeLeft === getDuration('work')) {
      setSessionStartTime(new Date().toISOString());
      onStartSession?.();
    }
    setIsRunning(!isRunning);
  };

  // Reset timer
  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(getDuration(mode));
    setSessionStartTime(null);
  };

  // Switch mode
  const switchMode = (newMode: TimerMode) => {
    setIsRunning(false);
    setMode(newMode);
    setTimeLeft(getDuration(newMode));
    setSessionStartTime(null);
  };

  // Today's stats
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySessions = sessions.filter(s => new Date(s.startedAt) >= todayStart && s.type === 'work' && s.isCompleted);
  const todayFocusTime = todaySessions.reduce((acc, s) => acc + s.duration, 0);

  // Get mode info
  const getModeInfo = () => {
    switch (mode) {
      case 'work':
        return { label: 'Focus Time', icon: Brain, color: 'text-red-500', bgColor: 'bg-red-500' };
      case 'shortBreak':
        return { label: 'Short Break', icon: Coffee, color: 'text-green-500', bgColor: 'bg-green-500' };
      case 'longBreak':
        return { label: 'Long Break', icon: Zap, color: 'text-blue-500', bgColor: 'bg-blue-500' };
    }
  };

  const modeInfo = getModeInfo();

  return (
    <div className="space-y-3">
      {/* Hidden audio element for notifications */}
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      {/* Mode Selector */}
      <div className="flex border border-border rounded-lg overflow-hidden">
        {([
          { mode: 'work' as TimerMode, label: 'Focus', icon: Brain },
          { mode: 'shortBreak' as TimerMode, label: 'Short', icon: Coffee },
          { mode: 'longBreak' as TimerMode, label: 'Long', icon: Zap }
        ]).map(({ mode: m, label, icon: Icon }) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={cn(
              "flex-1 py-2 px-3 text-xs font-medium transition-all flex items-center justify-center gap-1",
              mode === m 
                ? "bg-foreground text-background" 
                : "hover:bg-muted"
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Timer Display */}
      <div className="relative">
        {/* Progress ring background */}
        <div className="w-full aspect-square max-w-[200px] mx-auto relative">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-muted"
            />
            {/* Progress circle */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 45}`}
              strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
              className={cn("transition-all duration-1000", modeInfo.color)}
            />
          </svg>
          
          {/* Timer content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <modeInfo.icon className={cn("h-6 w-6 mb-1", modeInfo.color)} />
            <span className="text-3xl font-mono font-bold text-foreground">
              {formatTime(timeLeft)}
            </span>
            <span className="text-xs text-muted-foreground mt-1">{modeInfo.label}</span>
          </div>
        </div>
      </div>

      {/* Task Input */}
      {mode === 'work' && (
        <Input
          placeholder="What are you working on?"
          value={taskTitle}
          onChange={(e) => setTaskTitle(e.target.value)}
          className="h-8 text-xs text-center"
          disabled={isRunning}
        />
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10"
          onClick={resetTimer}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        
        <Button
          size="lg"
          className={cn(
            "h-14 w-14 rounded-full transition-all",
            isRunning ? "bg-orange-500 hover:bg-orange-600" : modeInfo.bgColor
          )}
          onClick={toggleTimer}
        >
          {isRunning ? (
            <Pause className="h-6 w-6" />
          ) : (
            <Play className="h-6 w-6 ml-0.5" />
          )}
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10"
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-3 border border-border rounded-lg space-y-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Timer Settings</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6"
              onClick={() => setShowSettings(false)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Focus (min)</label>
              <Input
                type="number"
                min={1}
                max={60}
                value={settings.workDuration}
                onChange={(e) => onSettingsChange({ ...settings, workDuration: parseInt(e.target.value) || 25 })}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Short Break</label>
              <Input
                type="number"
                min={1}
                max={30}
                value={settings.shortBreakDuration}
                onChange={(e) => onSettingsChange({ ...settings, shortBreakDuration: parseInt(e.target.value) || 5 })}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Long Break</label>
              <Input
                type="number"
                min={1}
                max={60}
                value={settings.longBreakDuration}
                onChange={(e) => onSettingsChange({ ...settings, longBreakDuration: parseInt(e.target.value) || 15 })}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Pomodoros/Long</label>
              <Input
                type="number"
                min={2}
                max={8}
                value={settings.sessionsBeforeLongBreak}
                onChange={(e) => onSettingsChange({ ...settings, sessionsBeforeLongBreak: parseInt(e.target.value) || 4 })}
                className="h-7 text-xs"
              />
            </div>
          </div>
          
          {/* Toggle options */}
          <div className="space-y-2">
            {[
              { key: 'autoStartBreaks', label: 'Auto-start breaks' },
              { key: 'autoStartPomodoros', label: 'Auto-start pomodoros' },
              { key: 'soundEnabled', label: 'Sound notifications' },
              { key: 'notificationsEnabled', label: 'Browser notifications' }
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-foreground">{label}</span>
                <button
                  onClick={() => onSettingsChange({ ...settings, [key]: !settings[key as keyof PomodoroSettings] })}
                  className={cn(
                    "w-8 h-4 rounded-full transition-colors relative",
                    settings[key as keyof PomodoroSettings] ? "bg-green-500" : "bg-muted"
                  )}
                >
                  <div className={cn(
                    "w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform",
                    settings[key as keyof PomodoroSettings] ? "translate-x-4.5" : "translate-x-0.5"
                  )} />
                </button>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Session Stats */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <Target className={cn("h-3 w-3", completedPomodoros > 0 ? "text-red-500" : "text-muted-foreground")} />
            <span className="text-lg font-bold text-foreground">{completedPomodoros}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">This Session</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <Brain className={cn("h-3 w-3", todaySessions.length > 0 ? "text-blue-500" : "text-muted-foreground")} />
            <span className="text-lg font-bold text-foreground">{todaySessions.length}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Today</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <Zap className={cn("h-3 w-3", todayFocusTime > 0 ? "text-yellow-500" : "text-muted-foreground")} />
            <span className="text-lg font-bold text-foreground">{Math.round(todayFocusTime / 60)}h</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Focus Time</p>
        </div>
      </div>

      {/* Pomodoro progress dots */}
      {completedPomodoros > 0 && (
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: settings.sessionsBeforeLongBreak }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-2.5 h-2.5 rounded-full transition-all",
                i < (completedPomodoros % settings.sessionsBeforeLongBreak) || 
                (completedPomodoros % settings.sessionsBeforeLongBreak === 0 && completedPomodoros > 0)
                  ? "bg-red-500"
                  : "bg-muted"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PomodoroTimer;
