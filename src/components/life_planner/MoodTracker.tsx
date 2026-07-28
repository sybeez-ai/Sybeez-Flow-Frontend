/**
 * Mood Tracker Component
 * Simple mood logging with emoji and optional notes
 */

import { useState } from "react";
import { 
  Smile, 
  SmilePlus, 
  Meh, 
  Frown, 
  CloudRain,
  Sun,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoodEntry } from "@/types/dailyLife";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface MoodTrackerProps {
  moods: MoodEntry[];
  onAddMood: (mood: Omit<MoodEntry, 'id'>) => void;
  onUpdateMood?: (moodId: string, updates: Partial<MoodEntry>) => void;
}

type MoodLevel = 1 | 2 | 3 | 4 | 5;

const MOOD_OPTIONS: { level: MoodLevel; emoji: string; label: string; color: string }[] = [
  { level: 1, emoji: '😢', label: 'Terrible', color: 'text-red-500 bg-red-500/10 border-red-500/30' },
  { level: 2, emoji: '😕', label: 'Bad', color: 'text-orange-500 bg-orange-500/10 border-orange-500/30' },
  { level: 3, emoji: '😐', label: 'Okay', color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30' },
  { level: 4, emoji: '😊', label: 'Good', color: 'text-green-500 bg-green-500/10 border-green-500/30' },
  { level: 5, emoji: '😄', label: 'Great', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' }
];

const MOOD_FACTORS = [
  '💪 Exercise', '😴 Sleep', '🍎 Food', '👥 Social', '💼 Work', 
  '🧘 Meditation', '☀️ Weather', '📚 Learning', '🎮 Leisure', '❤️ Family'
];

const MoodTracker = ({ moods, onAddMood, onUpdateMood }: MoodTrackerProps) => {
  const [selectedMood, setSelectedMood] = useState<MoodLevel | null>(null);
  const [note, setNote] = useState('');
  const [selectedFactors, setSelectedFactors] = useState<string[]>([]);
  const [showFactors, setShowFactors] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const todayMood = moods.find(m => m.date === today);

  // Get last 7 days moods
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });

  const last7DaysMoods = last7Days.map(date => ({
    date,
    mood: moods.find(m => m.date === date)
  }));

  // Calculate average mood
  const recentMoods = moods.filter(m => last7Days.includes(m.date));
  const averageMood = recentMoods.length > 0
    ? (recentMoods.reduce((acc, m) => acc + m.mood, 0) / recentMoods.length).toFixed(1)
    : '—';

  // Calculate trend
  const getMoodTrend = () => {
    if (recentMoods.length < 2) return null;
    const firstHalf = recentMoods.slice(0, Math.floor(recentMoods.length / 2));
    const secondHalf = recentMoods.slice(Math.floor(recentMoods.length / 2));
    
    const firstAvg = firstHalf.reduce((acc, m) => acc + m.mood, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((acc, m) => acc + m.mood, 0) / secondHalf.length;
    
    if (secondAvg - firstAvg > 0.5) return 'up';
    if (firstAvg - secondAvg > 0.5) return 'down';
    return 'stable';
  };

  const trend = getMoodTrend();

  // Toggle factor selection
  const toggleFactor = (factor: string) => {
    setSelectedFactors(prev => 
      prev.includes(factor) 
        ? prev.filter(f => f !== factor)
        : [...prev, factor]
    );
  };

  // Handle mood submission
  const handleSubmit = () => {
    if (!selectedMood) {
      toast.error('Please select how you\'re feeling');
      return;
    }

    const moodOption = getMoodOption(selectedMood);
    const now = new Date();
    
    onAddMood({
      date: today,
      time: now.toTimeString().split(' ')[0].slice(0, 5),
      mood: selectedMood,
      moodLabel: moodOption.label.toLowerCase() as MoodEntry['moodLabel'],
      note: note || undefined,
      factors: selectedFactors.length > 0 ? selectedFactors : undefined
    });

    setSelectedMood(null);
    setNote('');
    setSelectedFactors([]);
    setShowFactors(false);
    toast.success('Mood logged! 🌟');
  };

  // Get mood emoji by level
  const getMoodOption = (level: MoodLevel) => MOOD_OPTIONS.find(m => m.level === level)!;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-3 border border-border rounded-lg">
          <p className="text-2xl font-bold text-foreground">{averageMood}</p>
          <p className="text-[10px] text-muted-foreground">Avg. Mood (7d)</p>
        </div>
        <div className="text-center p-3 border border-border rounded-lg">
          <p className="text-2xl font-bold text-foreground">{recentMoods.length}</p>
          <p className="text-[10px] text-muted-foreground">Entries (7d)</p>
        </div>
        <div className="text-center p-3 border border-border rounded-lg flex flex-col items-center justify-center">
          {trend === 'up' && (
            <>
              <TrendingUp className="h-6 w-6 text-green-500" />
              <p className="text-[10px] text-green-500">Improving</p>
            </>
          )}
          {trend === 'down' && (
            <>
              <TrendingDown className="h-6 w-6 text-red-500" />
              <p className="text-[10px] text-red-500">Declining</p>
            </>
          )}
          {trend === 'stable' && (
            <>
              <Meh className="h-6 w-6 text-yellow-500" />
              <p className="text-[10px] text-yellow-500">Stable</p>
            </>
          )}
          {!trend && (
            <>
              <Sparkles className="h-6 w-6 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground">Need Data</p>
            </>
          )}
        </div>
      </div>

      {/* Today's Mood Entry */}
      {todayMood ? (
        <div className={cn(
          "p-4 rounded-lg border text-center",
          getMoodOption(todayMood.mood as MoodLevel).color
        )}>
          <p className="text-4xl mb-2">{getMoodOption(todayMood.mood as MoodLevel).emoji}</p>
          <p className="font-medium">Today you felt {getMoodOption(todayMood.mood as MoodLevel).label}</p>
          {todayMood.note && (
            <p className="text-xs text-muted-foreground mt-2">"{todayMood.note}"</p>
          )}
          {todayMood.factors && todayMood.factors.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center mt-2">
              {todayMood.factors.map(f => (
                <span key={f} className="text-xs px-2 py-0.5 bg-background/50 rounded-full">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 border border-border rounded-lg space-y-4">
          <div className="text-center mb-2">
            <p className="font-medium text-foreground">How are you feeling today?</p>
            <p className="text-xs text-muted-foreground">Tap to log your mood</p>
          </div>

          {/* Mood Selection */}
          <div className="flex justify-center gap-2">
            {MOOD_OPTIONS.map(option => (
              <button
                key={option.level}
                onClick={() => {
                  setSelectedMood(option.level);
                  setShowFactors(true);
                }}
                className={cn(
                  "p-3 rounded-lg border-2 transition-all hover:scale-110",
                  selectedMood === option.level
                    ? option.color + " border-current"
                    : "border-transparent hover:border-border"
                )}
              >
                <span className="text-2xl">{option.emoji}</span>
              </button>
            ))}
          </div>

          {/* Factors & Note (shown after mood selection) */}
          {showFactors && (
            <>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">What influenced your mood?</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {MOOD_FACTORS.map(factor => (
                    <button
                      key={factor}
                      onClick={() => toggleFactor(factor)}
                      className={cn(
                        "text-xs px-2 py-1 rounded-full border transition-colors",
                        selectedFactors.includes(factor)
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background text-muted-foreground border-border hover:border-foreground"
                      )}
                    >
                      {factor}
                    </button>
                  ))}
                </div>
              </div>

              <Input
                placeholder="Add a note (optional)..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="text-sm"
              />

              <Button onClick={handleSubmit} className="w-full">
                <Sparkles className="h-4 w-4 mr-2" />
                Log Today's Mood
              </Button>
            </>
          )}
        </div>
      )}

      {/* 7-Day Mood History */}
      <div className="border border-border rounded-lg p-3">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Last 7 Days</span>
        </div>
        
        <div className="flex gap-1">
          {last7DaysMoods.map(({ date, mood }) => {
            const dayName = new Date(date).toLocaleDateString('en', { weekday: 'short' }).charAt(0);
            const isToday = date === today;
            
            return (
              <div 
                key={date} 
                className={cn(
                  "flex-1 flex flex-col items-center p-2 rounded-lg transition-colors",
                  isToday && "bg-muted"
                )}
              >
                <span className="text-[10px] text-muted-foreground mb-1">{dayName}</span>
                {mood ? (
                  <span className="text-xl">{getMoodOption(mood.mood as MoodLevel).emoji}</span>
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-dashed border-muted-foreground/30" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Insights */}
      {recentMoods.length >= 3 && (
        <div className="p-3 border border-border rounded-lg bg-muted/30">
          <div className="flex items-center gap-2 mb-2">
            <Sun className="h-4 w-4 text-yellow-500" />
            <span className="text-xs font-medium">Quick Insight</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {trend === 'up' && "Your mood has been improving! Keep up whatever you're doing. 💪"}
            {trend === 'down' && "You've been feeling a bit down lately. Consider self-care activities. 🤗"}
            {trend === 'stable' && "Your mood has been consistent. That's a sign of good emotional balance! ⚖️"}
          </p>
        </div>
      )}
    </div>
  );
};

export default MoodTracker;
