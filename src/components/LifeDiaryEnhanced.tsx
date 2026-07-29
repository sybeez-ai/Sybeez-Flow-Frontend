import { usGetItem, usSetItem } from "@/services/userStorage";
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BookOpen, Heart, Lightbulb, Trophy, BookMarked, TrendingUp, Calendar,
  Brain, Trash2, Search, Plus, X, Flame, Zap, Sparkles, Award,
  ArrowUp, ArrowDown, Minus, Sun
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from "@/lib/utils";
import { diaryApi, checkBackendHealth } from '@/services/backendApi';

// Types
interface DiaryEntry {
  id: string;
  date: string;
  title: string;
  content: string;
  mood: 'positive' | 'neutral' | 'negative';
  energy: number; // 1-10
  highlights: string[];
  challenges: string[];
  focusTomorrow: string[];
  summary?: string;
  isRecording: boolean;
}

interface Memory {
  id: string;
  date: string;
  title: string;
  description: string;
  /** Optional tag — kept for Achievements / older data; not shown in Memories UI. */
  category?: 'memory' | 'achievement' | 'milestone' | 'certificate' | 'trip' | 'idea';
  image?: string;
}

interface Thought {
  id: string;
  date: string;
  content: string;
  category: 'dream' | 'startup' | 'creative' | 'future';
}

interface GrowthMetric {
  category: 'career' | 'finance' | 'health' | 'learning' | 'relationships';
  score: number;
  trend: 'up' | 'down' | 'stable';
}

interface GratitudeEntry {
  id: string;
  date: string;
  items: string[];
}

interface LifeDiaryData {
  entries: DiaryEntry[];
  memories: Memory[];
  thoughts: Thought[];
  growthMetrics: GrowthMetric[];
  gratitude: GratitudeEntry[];
  weeklyReflections: { week: string; reflection: string }[];
}

type Mood = DiaryEntry['mood'];
type ThoughtCategory = Thought['category'];

// Storage — localStorage is source of truth; backend is backup only.
const DIARY_KEY = "sybeez_life_diary";

const DEFAULT_GROWTH: GrowthMetric[] = [
  { category: 'career', score: 0, trend: 'stable' },
  { category: 'finance', score: 0, trend: 'stable' },
  { category: 'health', score: 0, trend: 'stable' },
  { category: 'learning', score: 0, trend: 'stable' },
  { category: 'relationships', score: 0, trend: 'stable' },
];

function emptyDiaryData(): LifeDiaryData {
  return {
    entries: [],
    memories: [],
    thoughts: [],
    growthMetrics: [...DEFAULT_GROWTH],
    gratitude: [],
    weeklyReflections: [],
  };
}

function normalizeEntry(raw: any): DiaryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const content = String(raw.content || raw.story || '').trim();
  const date =
    String(raw.date || '').slice(0, 10) ||
    String(raw.timestamp || new Date().toISOString()).slice(0, 10);
  let focusTomorrow: string[] = [];
  if (Array.isArray(raw.focusTomorrow)) focusTomorrow = raw.focusTomorrow.map(String);
  else if (Array.isArray(raw.tomorrowFocus)) focusTomorrow = raw.tomorrowFocus.map(String);
  else if (typeof raw.tomorrowFocus === 'string' && raw.tomorrowFocus.trim()) {
    focusTomorrow = [raw.tomorrowFocus.trim()];
  }
  const moodRaw = String(raw.mood || 'neutral');
  const mood: Mood =
    moodRaw === 'positive' || moodRaw === 'negative' || moodRaw === 'neutral'
      ? moodRaw
      : moodRaw.includes('😊') || moodRaw.toLowerCase() === 'happy'
        ? 'positive'
        : moodRaw.includes('😔') || moodRaw.toLowerCase() === 'sad'
          ? 'negative'
          : 'neutral';
  return {
    id: String(raw.id || Date.now()),
    date,
    title: String(raw.title || date || 'Entry'),
    content,
    mood,
    energy: Math.min(10, Math.max(1, Number(raw.energy) || 5)),
    highlights: Array.isArray(raw.highlights) ? raw.highlights.map(String) : [],
    challenges: Array.isArray(raw.challenges) ? raw.challenges.map(String) : [],
    focusTomorrow,
    summary: raw.summary ? String(raw.summary) : undefined,
    isRecording: Boolean(raw.isRecording),
  };
}

function normalizeDiaryData(raw: any): LifeDiaryData {
  const base = emptyDiaryData();
  if (!raw || typeof raw !== 'object') return base;
  const entries = (Array.isArray(raw.entries) ? raw.entries : [])
    .map(normalizeEntry)
    .filter((e): e is DiaryEntry => Boolean(e && (e.content || e.title)));
  return {
    entries,
    memories: Array.isArray(raw.memories) ? raw.memories : [],
    thoughts: Array.isArray(raw.thoughts) ? raw.thoughts : [],
    growthMetrics: Array.isArray(raw.growthMetrics) && raw.growthMetrics.length
      ? raw.growthMetrics
      : base.growthMetrics,
    gratitude: Array.isArray(raw.gratitude) ? raw.gratitude : [],
    weeklyReflections: Array.isArray(raw.weeklyReflections) ? raw.weeklyReflections : [],
  };
}

function loadDiaryData(): LifeDiaryData {
  try {
    const raw = usGetItem(DIARY_KEY);
    if (raw) return normalizeDiaryData(JSON.parse(raw));
  } catch {
    /* fall through */
  }
  return emptyDiaryData();
}

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of remote) map.set(item.id, item);
  for (const item of local) map.set(item.id, item); // local wins
  return Array.from(map.values());
}

function mergeDiaryData(local: LifeDiaryData, remote: LifeDiaryData): LifeDiaryData {
  return {
    entries: mergeById(local.entries, remote.entries).sort((a, b) =>
      b.date.localeCompare(a.date) || Number(b.id) - Number(a.id)
    ),
    memories: mergeById(local.memories, remote.memories),
    thoughts: mergeById(local.thoughts, remote.thoughts),
    gratitude: mergeById(local.gratitude, remote.gratitude),
    growthMetrics: local.growthMetrics?.length ? local.growthMetrics : remote.growthMetrics,
    weeklyReflections: mergeById(
      local.weeklyReflections.map((w, i) => ({ id: w.week || String(i), ...w })) as any,
      remote.weeklyReflections.map((w, i) => ({ id: w.week || String(i), ...w })) as any
    ).map(({ id: _id, ...rest }: any) => rest),
  };
}

async function loadDiaryDataFromBackend(): Promise<LifeDiaryData | null> {
  try {
    const isHealthy = await checkBackendHealth();
    if (!isHealthy) return null;

    try {
      const blob = await diaryApi.getData();
      if (blob && typeof blob === 'object') {
        return normalizeDiaryData(blob);
      }
    } catch {
      /* older backend — fall back to entries list */
    }

    const entries = await diaryApi.getEntries();
    if (Array.isArray(entries)) {
      return normalizeDiaryData({ entries });
    }
    return null;
  } catch (error) {
    console.warn('Failed to load diary data from backend', error);
    return null;
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function saveDiaryData(data: LifeDiaryData) {
  usSetItem(DIARY_KEY, JSON.stringify(data));
  try {
    window.dispatchEvent(new CustomEvent('sybeez:data-changed', { detail: { key: DIARY_KEY } }));
  } catch {
    /* ignore */
  }

  // Debounced full-blob sync (never wipe local if sync fails)
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const ok = await checkBackendHealth();
      if (!ok) return;
      await diaryApi.saveData(data);
    } catch (error) {
      console.warn('Failed to sync diary to backend', error);
    }
  }, 600);
}

// Helper to get today's date
function getTodayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

// Helper to format date
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────
type TabId = 'today' | 'timeline' | 'memories' | 'thoughts' | 'gratitude' | 'achievements' | 'lessons' | 'goals' | 'ai-reflection';

const SIDEBAR_ITEMS: { id: TabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'today', label: 'Today', icon: BookOpen },
  { id: 'timeline', label: 'Timeline', icon: Calendar },
  { id: 'memories', label: 'Memories', icon: Heart },
  { id: 'thoughts', label: 'Thoughts', icon: Lightbulb },
  { id: 'gratitude', label: 'Gratitude', icon: Sun },
  { id: 'achievements', label: 'Achievements', icon: Trophy },
  { id: 'lessons', label: 'Lessons Learned', icon: BookMarked },
  { id: 'goals', label: 'Goals Journey', icon: TrendingUp },
  { id: 'ai-reflection', label: 'Insights', icon: Brain },
];

const LifeDiaryEnhanced: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [data, setDataState] = useState<LifeDiaryData>(loadDiaryData);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [entryTitle, setEntryTitle] = useState('');
  const [entryContent, setEntryContent] = useState('');
  const [selectedMood, setSelectedMood] = useState<Mood>('neutral');
  const [selectedEnergy, setSelectedEnergy] = useState(5);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [challenges, setChallenges] = useState<string[]>([]);
  const [focusTomorrow, setFocusTomorrow] = useState<string[]>([]);
  const [highlightInput, setHighlightInput] = useState('');
  const [challengeInput, setChallengeInput] = useState('');
  const [focusInput, setFocusInput] = useState('');
  const [gratitudeItems, setGratitudeItems] = useState<string[]>([]);
  const [memoryTitle, setMemoryTitle] = useState('');
  const [memoryDesc, setMemoryDesc] = useState('');
  const [thoughtContent, setThoughtContent] = useState('');
  const [thoughtCategory, setThoughtCategory] = useState<ThoughtCategory>('dream');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [winTitle, setWinTitle] = useState('');
  const [winDesc, setWinDesc] = useState('');

  // Set data with auto-sync
  const setData = useCallback((updater: React.SetStateAction<LifeDiaryData>) => {
    setDataState(prev => {
      const next = typeof updater === 'function'
        ? (updater as (prevState: LifeDiaryData) => LifeDiaryData)(prev)
        : updater;
      saveDiaryData(next);
      return next;
    });
  }, []);

  // Local-first: never replace local vaults with empty backend data.
  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      const local = loadDiaryData();
      if (!cancelled) setDataState(local);
      try {
        const remote = await loadDiaryDataFromBackend();
        if (cancelled) return;
        if (remote) {
          const merged = mergeDiaryData(local, remote);
          setDataState(merged);
          usSetItem(DIARY_KEY, JSON.stringify(merged));
          setIsConnected(true);
        } else {
          setIsConnected(false);
        }
      } catch (error) {
        console.error('Error loading diary data:', error);
        if (!cancelled) setIsConnected(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, []);

  // Add entry
  const addDiaryEntry = useCallback(() => {
    if (!entryContent.trim()) {
      toast.error('Please write something!', { position: 'top-center' });
      return;
    }

    const newEntry: DiaryEntry = {
      id: Date.now().toString(),
      date: getTodayDateStr(),
      title: entryTitle || `Day: ${new Date().toLocaleDateString()}`,
      content: entryContent,
      mood: selectedMood,
      energy: selectedEnergy,
      highlights,
      challenges,
      focusTomorrow,
      isRecording: false,
    };

    setData(prev => ({
      ...prev,
      entries: [newEntry, ...prev.entries],
    }));

    // Reset form
    setEntryTitle('');
    setEntryContent('');
    setSelectedMood('neutral');
    setSelectedEnergy(5);
    setHighlights([]);
    setChallenges([]);
    setFocusTomorrow([]);

    toast.success('Entry saved — view it in Timeline', { position: 'top-center', duration: 2000 });
    setActiveTab('timeline');
  }, [entryContent, entryTitle, selectedMood, selectedEnergy, highlights, challenges, focusTomorrow, setData]);

  // Add highlight
  const addHighlight = useCallback(() => {
    if (highlightInput.trim()) {
      setHighlights([...highlights, highlightInput]);
      setHighlightInput('');
    }
  }, [highlightInput, highlights]);

  // Add challenge
  const addChallenge = useCallback(() => {
    if (challengeInput.trim()) {
      setChallenges([...challenges, challengeInput]);
      setChallengeInput('');
    }
  }, [challengeInput, challenges]);

  // Add focus
  const addFocus = useCallback(() => {
    if (focusInput.trim()) {
      setFocusTomorrow([...focusTomorrow, focusInput]);
      setFocusInput('');
    }
  }, [focusInput, focusTomorrow]);

  // Save gratitude (persists the day's list into diary data)
  const saveGratitude = useCallback(() => {
    const items = gratitudeItems.map(g => g.trim()).filter(Boolean);
    if (items.length === 0) {
      toast.error('Add at least one thing you are grateful for', { position: 'top-center' });
      return;
    }
    const entry: GratitudeEntry = { id: Date.now().toString(), date: getTodayDateStr(), items };
    setData(prev => ({ ...prev, gratitude: [entry, ...prev.gratitude] }));
    setGratitudeItems([]);
    toast.success('✨ Gratitude saved!', { position: 'top-center', duration: 1500 });
  }, [gratitudeItems, setData]);

  // Add memory — title optional; at least one field required
  const addMemory = useCallback(() => {
    const title = memoryTitle.trim();
    const description = memoryDesc.trim();
    if (!title && !description) {
      toast.error('Write a little something to keep', { position: 'top-center' });
      return;
    }

    const newMemory: Memory = {
      id: Date.now().toString(),
      date: getTodayDateStr(),
      title: title || description.slice(0, 48) + (description.length > 48 ? '…' : ''),
      description: description || title,
      category: 'memory',
    };

    setData(prev => ({
      ...prev,
      memories: [newMemory, ...prev.memories],
    }));

    setMemoryTitle('');
    setMemoryDesc('');
    toast.success('Memory kept — you can find it below anytime', {
      position: 'top-center',
      duration: 2000,
    });
  }, [memoryTitle, memoryDesc, setData]);

  const addAchievement = useCallback(() => {
    const title = winTitle.trim();
    const description = winDesc.trim();
    if (!title && !description) {
      toast.error('Tell me what you achieved', { position: 'top-center' });
      return;
    }
    const newMemory: Memory = {
      id: Date.now().toString(),
      date: getTodayDateStr(),
      title: title || description.slice(0, 48) + (description.length > 48 ? '…' : ''),
      description: description || title,
      category: 'achievement',
    };
    setData(prev => ({ ...prev, memories: [newMemory, ...prev.memories] }));
    setWinTitle('');
    setWinDesc('');
    toast.success('Win saved — well done', { position: 'top-center', duration: 2000 });
  }, [winTitle, winDesc, setData]);

  // Add thought
  const addThought = useCallback(() => {
    if (!thoughtContent.trim()) {
      toast.error('Write your thought!', { position: 'top-center' });
      return;
    }

    const newThought: Thought = {
      id: Date.now().toString(),
      date: getTodayDateStr(),
      content: thoughtContent,
      category: thoughtCategory,
    };

    setData(prev => ({
      ...prev,
      thoughts: [newThought, ...prev.thoughts],
    }));

    setThoughtContent('');
    toast.success('💡 Thought recorded!', { position: 'top-center', duration: 2000 });
  }, [thoughtContent, thoughtCategory]);

  // Delete entry
  const deleteEntry = useCallback((id: string) => {
    setData(prev => ({
      ...prev,
      entries: prev.entries.filter(e => e.id !== id),
    }));
    toast.success('Entry deleted', { position: 'top-center', duration: 1500 });
  }, [setData]);

  const deleteMemory = useCallback((id: string) => {
    setData(prev => ({ ...prev, memories: prev.memories.filter(m => m.id !== id) }));
    toast.success('Memory deleted', { position: 'top-center', duration: 1500 });
  }, [setData]);

  const deleteThought = useCallback((id: string) => {
    setData(prev => ({ ...prev, thoughts: prev.thoughts.filter(t => t.id !== id) }));
    toast.success('Thought deleted', { position: 'top-center', duration: 1500 });
  }, [setData]);

  const deleteGratitude = useCallback((id: string) => {
    setData(prev => ({ ...prev, gratitude: prev.gratitude.filter(g => g.id !== id) }));
  }, [setData]);

  const updateGrowthMetric = useCallback((category: GrowthMetric['category'], score: number) => {
    setData(prev => ({
      ...prev,
      growthMetrics: prev.growthMetrics.map(m => {
        if (m.category !== category) return m;
        const trend: GrowthMetric['trend'] = score > m.score ? 'up' : score < m.score ? 'down' : 'stable';
        return { ...m, score, trend };
      }),
    }));
  }, [setData]);

  // ── Derived insights ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const entries = data.entries;
    const totalEntries = entries.length;
    const avgEnergy = totalEntries
      ? Math.round((entries.reduce((a, e) => a + (e.energy || 0), 0) / totalEntries) * 10) / 10
      : 0;
    const moodCounts = entries.reduce(
      (acc, e) => { acc[e.mood] = (acc[e.mood] || 0) + 1; return acc; },
      {} as Record<Mood, number>
    );
    // Writing streak: consecutive days ending today/yesterday with an entry.
    const dates = new Set(entries.map(e => e.date));
    let streak = 0;
    const cursor = new Date();
    const iso = (d: Date) => d.toISOString().split('T')[0];
    if (!dates.has(iso(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (dates.has(iso(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
    const dominantMood = (Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as Mood) || 'neutral';
    return {
      totalEntries,
      avgEnergy,
      moodCounts,
      streak,
      dominantMood,
      totalMemories: data.memories.length,
      totalThoughts: data.thoughts.length,
      totalGratitude: data.gratitude.length,
    };
  }, [data.entries, data.memories, data.thoughts, data.gratitude]);

  // Unified, searchable chronological feed for the Timeline tab.
  const timelineItems = useMemo(() => {
    type FeedItem = { id: string; date: string; kind: 'entry' | 'memory' | 'thought' | 'gratitude'; title: string; text: string };
    const items: FeedItem[] = [
      ...data.entries.map(e => ({ id: e.id, date: e.date, kind: 'entry' as const, title: e.title, text: e.content })),
      ...data.memories.map(m => ({ id: m.id, date: m.date, kind: 'memory' as const, title: m.title, text: m.description })),
      ...data.thoughts.map(t => ({ id: t.id, date: t.date, kind: 'thought' as const, title: t.category, text: t.content })),
      ...data.gratitude.map(g => ({ id: g.id, date: g.date, kind: 'gratitude' as const, title: 'Gratitude', text: g.items.join(' • ') })),
    ];
    const q = timelineSearch.trim().toLowerCase();
    return items
      .filter(i => !q || i.title.toLowerCase().includes(q) || i.text.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id));
  }, [data.entries, data.memories, data.thoughts, data.gratitude, timelineSearch]);

  // Lessons derived from the challenges logged in diary entries.
  const lessons = useMemo(
    () => data.entries.flatMap(e => (e.challenges || []).map((c, i) => ({ id: `${e.id}-${i}`, date: e.date, text: c }))),
    [data.entries]
  );

  // Render sections
  const renderToday = () => (
    <div className="space-y-4 max-w-2xl">
      <Card className="border-border bg-black">
        <CardHeader>
          <CardTitle className="text-base">📝 How was your day?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs text-muted-foreground font-medium">Title (optional)</label>
            <Input
              placeholder="Give today a title..."
              value={entryTitle}
              onChange={e => setEntryTitle(e.target.value)}
              className="text-sm bg-muted/10 border-border h-9"
            />
          </div>

          {/* Content */}
          <div>
            <label className="text-xs text-muted-foreground font-medium">Your Story</label>
            <textarea
              placeholder="Share what happened today, how you felt, what you learned..."
              value={entryContent}
              onChange={e => setEntryContent(e.target.value)}
              className="w-full h-32 p-3 text-sm bg-muted/10 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
            />
          </div>

          {/* Mood & Energy */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium">Mood</label>
              <div className="flex gap-2 mt-2">
                {['positive', 'neutral', 'negative'].map(mood => (
                  <button
                    key={mood}
                    onClick={() => setSelectedMood(mood as Mood)}
                    className={cn(
                      'flex-1 py-2 rounded-md text-xs font-medium transition-all',
                      selectedMood === mood
                        ? 'bg-white text-black'
                        : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                    )}
                  >
                    {mood === 'positive' ? '😊' : mood === 'neutral' ? '😐' : '😔'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium">Energy</label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={selectedEnergy}
                  onChange={e => setSelectedEnergy(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-xs font-medium bg-muted/20 px-2 py-1 rounded">{selectedEnergy}/10</span>
              </div>
            </div>
          </div>

          {/* Highlights */}
          <div>
            <label className="text-xs text-muted-foreground font-medium">⭐ Highlights</label>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="What went well?"
                value={highlightInput}
                onChange={e => setHighlightInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addHighlight()}
                className="text-sm bg-muted/10 border-border h-8"
              />
              <Button
                size="sm"
                onClick={addHighlight}
                className="shrink-0 bg-white text-black hover:bg-gray-200 h-8 px-3"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {highlights.map((h, i) => (
                <div
                  key={i}
                  className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded-full flex items-center gap-2"
                >
                  {h}
                  <button onClick={() => setHighlights(highlights.filter((_, idx) => idx !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Challenges */}
          <div>
            <label className="text-xs text-muted-foreground font-medium">⚠️ Challenges</label>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="What was difficult?"
                value={challengeInput}
                onChange={e => setChallengeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addChallenge()}
                className="text-sm bg-muted/10 border-border h-8"
              />
              <Button
                size="sm"
                onClick={addChallenge}
                className="shrink-0 bg-white text-black hover:bg-gray-200 h-8 px-3"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {challenges.map((c, i) => (
                <div
                  key={i}
                  className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded-full flex items-center gap-2"
                >
                  {c}
                  <button onClick={() => setChallenges(challenges.filter((_, idx) => idx !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Tomorrow Focus */}
          <div>
            <label className="text-xs text-muted-foreground font-medium">🎯 Tomorrow Focus</label>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="What's next?"
                value={focusInput}
                onChange={e => setFocusInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFocus()}
                className="text-sm bg-muted/10 border-border h-8"
              />
              <Button
                size="sm"
                onClick={addFocus}
                className="shrink-0 bg-white text-black hover:bg-gray-200 h-8 px-3"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {focusTomorrow.map((f, i) => (
                <div
                  key={i}
                  className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full flex items-center gap-2"
                >
                  {f}
                  <button onClick={() => setFocusTomorrow(focusTomorrow.filter((_, idx) => idx !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <Button
            onClick={addDiaryEntry}
            className="w-full bg-white text-black hover:bg-gray-200 h-10"
          >
            💾 Save Entry
          </Button>
        </CardContent>
      </Card>

      {/* Previous Entries */}
      {data.entries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">📚 Recent Entries</h3>
          {data.entries.slice(0, 5).map(entry => (
            <Card key={entry.id} className="border-border/50 bg-muted/10">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{formatDate(entry.date)}</p>
                    <p className="font-medium text-sm">{entry.title}</p>
                    <p className="text-sm text-foreground/90 mt-1 whitespace-pre-wrap">{entry.content}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => deleteEntry(entry.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderMemories = () => {
    const list = data.memories;

    return (
      <div className="space-y-5 max-w-2xl">
        <div>
          <h3 className="text-base font-semibold text-foreground">Moments worth keeping</h3>
          <p className="text-xs text-muted-foreground mt-1">
            A photo in words — people, places, little wins. Write freely; it stays here.
          </p>
        </div>

        <Card className="border-border bg-black">
          <CardContent className="p-5 space-y-4">
            <div>
              <label className="text-xs text-muted-foreground font-medium">What was it? (optional)</label>
              <Input
                placeholder="e.g. First coffee with Maya, the train to Lisbon…"
                value={memoryTitle}
                onChange={e => setMemoryTitle(e.target.value)}
                className="mt-1.5 text-sm bg-muted/10 border-border h-10"
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    addMemory();
                  }
                }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Tell the story</label>
              <textarea
                placeholder="Who was there? How did it feel? What do you want to remember years from now…"
                value={memoryDesc}
                onChange={e => setMemoryDesc(e.target.value)}
                className="mt-1.5 w-full min-h-[140px] p-3 text-sm leading-relaxed bg-muted/10 border border-border rounded-md text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-foreground resize-y"
              />
            </div>
            <Button
              onClick={addMemory}
              className="w-full bg-white text-black hover:bg-gray-200 h-10 font-medium"
            >
              Keep this memory
            </Button>
          </CardContent>
        </Card>

        {list.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground border border-dashed border-border/60 rounded-xl">
            <Heart className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium text-foreground/80">Your memory book is empty</p>
            <p className="text-xs mt-1 max-w-xs mx-auto">
              Capture something small today — a laugh, a view, a quiet win. It all counts.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Your memories</h3>
              <span className="text-[11px] text-muted-foreground">{list.length} kept</span>
            </div>
            {list.map(memory => (
              <Card key={memory.id} className="border-border/50 bg-muted/10 hover:bg-muted/15 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted-foreground">{formatDate(memory.date)}</p>
                      <p className="font-medium text-sm mt-1 text-foreground">{memory.title}</p>
                      {memory.description && memory.description !== memory.title && (
                        <p className="text-sm text-foreground/85 mt-2 whitespace-pre-wrap leading-relaxed">
                          {memory.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMemory(memory.id)}
                      title="Remove memory"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderThoughts = () => (
    <div className="space-y-4 max-w-2xl">
      <Card className="border-border bg-black">
        <CardHeader>
          <CardTitle className="text-base">💭 Record a Thought</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            placeholder="Your startup idea, dream, creative thought..."
            value={thoughtContent}
            onChange={e => setThoughtContent(e.target.value)}
            className="w-full h-24 p-3 text-sm bg-muted/10 border border-border rounded-md text-foreground"
          />
          <div>
            <label className="text-xs text-muted-foreground font-medium">Category</label>
            <select
              value={thoughtCategory}
              onChange={e => setThoughtCategory(e.target.value as ThoughtCategory)}
              className="w-full mt-2 p-2 text-sm bg-muted/10 border border-border rounded-md text-foreground"
            >
              <option value="dream">Dream</option>
              <option value="startup">Startup Idea</option>
              <option value="creative">Creative</option>
              <option value="future">Future Plan</option>
            </select>
          </div>
          <Button
            onClick={addThought}
            className="w-full bg-white text-black hover:bg-gray-200 h-10"
          >
            Save Thought
          </Button>
        </CardContent>
      </Card>

      {/* Thoughts List */}
      {data.thoughts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">💡 Ideas & Thoughts</h3>
          {data.thoughts.map(thought => (
            <Card key={thought.id} className="border-border/50 bg-muted/10">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{formatDate(thought.date)}</p>
                    <p className="text-sm">{thought.content}</p>
                    <span className="inline-block text-xs bg-muted/30 px-2 py-1 rounded mt-2 capitalize">{thought.category}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => deleteThought(thought.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderGratitude = () => (
    <div className="space-y-4 max-w-2xl">
      <Card className="border-border bg-black">
        <CardHeader>
          <CardTitle className="text-base">✨ Gratitude Journal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">3 things you're grateful for today:</p>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-2">
                <span className="text-xs font-medium text-muted-foreground min-w-fit">{i}.</span>
                <Input
                  placeholder={`Be grateful for...`}
                  value={gratitudeItems[i - 1] || ''}
                  onChange={e => {
                    const updated = [...gratitudeItems];
                    updated[i - 1] = e.target.value;
                    setGratitudeItems(updated);
                  }}
                  className="text-sm bg-muted/10 border-border h-9"
                />
              </div>
            ))}
          </div>
          <Button
            onClick={saveGratitude}
            className="w-full bg-white text-black hover:bg-gray-200 h-10"
          >
            Save Gratitude
          </Button>
        </CardContent>
      </Card>

      {data.gratitude.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">🙏 Gratitude Log</h3>
          {data.gratitude.map(g => (
            <Card key={g.id} className="border-border/50 bg-muted/10">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{formatDate(g.date)}</p>
                    <ul className="mt-1 space-y-0.5">
                      {g.items.map((item, i) => (
                        <li key={i} className="text-sm text-foreground flex gap-2">
                          <Sun className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => deleteGratitude(g.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // ── Timeline ─────────────────────────────────────────────────────────────────
  const KIND_META: Record<string, { label: string; cls: string }> = {
    entry: { label: 'Diary', cls: 'bg-blue-500/20 text-blue-300' },
    memory: { label: 'Memory', cls: 'bg-pink-500/20 text-pink-300' },
    thought: { label: 'Thought', cls: 'bg-amber-500/20 text-amber-300' },
    gratitude: { label: 'Gratitude', cls: 'bg-green-500/20 text-green-300' },
  };

  const renderTimeline = () => (
    <div className="space-y-4 max-w-2xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search your life timeline..."
          value={timelineSearch}
          onChange={e => setTimelineSearch(e.target.value)}
          className="pl-9 text-sm bg-muted/10 border-border h-9"
        />
      </div>
      {timelineItems.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{timelineSearch ? 'No matches found' : 'Your life events will appear here as you journal'}</p>
        </div>
      ) : (
        <div className="relative pl-4 border-l border-border space-y-3">
          {timelineItems.map(item => {
            const meta = KIND_META[item.kind];
            return (
              <div key={`${item.kind}-${item.id}`} className="relative">
                <span className="absolute -left-[21px] top-2 h-2.5 w-2.5 rounded-full bg-foreground" />
                <Card className="border-border/50 bg-muted/10">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', meta.cls)}>{meta.label}</span>
                    </div>
                    <p className="font-medium text-sm capitalize">{item.title}</p>
                    <p className="text-sm text-foreground/90 mt-1 whitespace-pre-wrap">{item.text || '—'}</p>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Achievements (from memories tagged as wins) ───────────────────────────────
  const renderAchievementsTab = () => {
    const achievements = data.memories.filter(m =>
      ['achievement', 'milestone', 'certificate'].includes(m.category || '')
    );
    return (
      <div className="space-y-4 max-w-2xl">
        <div>
          <h3 className="text-base font-semibold text-foreground">Celebrate a win</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Big or small — finishing something counts.
          </p>
        </div>
        <Card className="border-border bg-black">
          <CardContent className="p-5 space-y-3">
            <Input
              placeholder="What did you pull off?"
              value={winTitle}
              onChange={e => setWinTitle(e.target.value)}
              className="text-sm bg-muted/10 border-border h-10"
            />
            <textarea
              placeholder="A few words about how it felt…"
              value={winDesc}
              onChange={e => setWinDesc(e.target.value)}
              className="w-full min-h-[88px] p-3 text-sm leading-relaxed bg-muted/10 border border-border rounded-md text-foreground resize-y"
            />
            <Button onClick={addAchievement} className="w-full bg-white text-black hover:bg-gray-200 h-10">
              <Award className="h-4 w-4 mr-2" /> Keep this win
            </Button>
          </CardContent>
        </Card>

        {achievements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Your wins will show up here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {achievements.map(a => (
              <Card key={a.id} className="border-border/50 bg-gradient-to-r from-yellow-500/5 to-transparent">
                <CardContent className="p-3 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/15 shrink-0">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{a.title}</p>
                    {a.description && a.description !== a.title && (
                      <p className="text-sm text-foreground/85 mt-1 whitespace-pre-wrap">{a.description}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">{formatDate(a.date)}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => deleteMemory(a.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Lessons Learned (from entry challenges) ────────────────────────────────────
  const renderLessons = () => (
    <div className="space-y-4 max-w-2xl">
      <Card className="border-border bg-black">
        <CardHeader>
          <CardTitle className="text-base">📚 Lessons Learned</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            These are the challenges you logged in your diary — reflect on what each one taught you.
          </p>
        </CardContent>
      </Card>
      {lessons.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <BookMarked className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Add challenges to your daily entries and they'll show up here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lessons.map(l => (
            <Card key={l.id} className="border-border/50 bg-muted/10">
              <CardContent className="p-3 flex items-start gap-3">
                <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-foreground">{l.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{formatDate(l.date)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // ── Goals Journey (editable growth metrics) ────────────────────────────────────
  const TrendIcon = ({ trend }: { trend: GrowthMetric['trend'] }) =>
    trend === 'up' ? <ArrowUp className="h-3 w-3 text-green-500" />
    : trend === 'down' ? <ArrowDown className="h-3 w-3 text-red-500" />
    : <Minus className="h-3 w-3 text-muted-foreground" />;

  const renderGoals = () => (
    <div className="space-y-4 max-w-2xl">
      <Card className="border-border bg-black">
        <CardHeader>
          <CardTitle className="text-base">🎯 Goals Journey</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">Rate how you feel you're progressing in each area of life.</p>
          {data.growthMetrics.map(metric => (
            <div key={metric.category}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium capitalize">{metric.category}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendIcon trend={metric.trend} /> {metric.score}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={metric.score}
                  onChange={e => updateGrowthMetric(metric.category, Number(e.target.value))}
                  className="flex-1"
                />
                <div className="w-24 h-2 bg-muted/30 rounded-full overflow-hidden">
                  <div className="h-full bg-foreground rounded-full transition-all" style={{ width: `${metric.score}%` }} />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );

  // ── AI Reflection (computed) ───────────────────────────────────────────────────
  const renderReflection = () => {
    const moodEmoji: Record<Mood, string> = { positive: '😊', neutral: '😐', negative: '😔' };
    const insights: string[] = [];
    if (stats.totalEntries === 0) {
      insights.push('Start journaling to unlock personalised reflections about your life patterns.');
    } else {
      insights.push(`You've written ${stats.totalEntries} ${stats.totalEntries === 1 ? 'entry' : 'entries'} and your average energy is ${stats.avgEnergy}/10.`);
      if (stats.streak > 1) insights.push(`You're on a ${stats.streak}-day journaling streak — keep the momentum going! 🔥`);
      insights.push(`Your most common mood is "${stats.dominantMood}" ${moodEmoji[stats.dominantMood]}.`);
      if (stats.avgEnergy < 5) insights.push('Your energy has been on the lower side — consider prioritising rest and movement.');
      else if (stats.avgEnergy >= 7) insights.push('Your energy levels are strong — great time to tackle ambitious goals.');
    }
    return (
      <div className="space-y-4 max-w-2xl">
        <p className="text-xs text-muted-foreground">
          Chat with Life Companion on the right — it can see your saved diary entries.
        </p>
        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Entries', value: stats.totalEntries, Icon: BookOpen },
            { label: 'Day Streak', value: stats.streak, Icon: Flame },
            { label: 'Avg Energy', value: `${stats.avgEnergy}`, Icon: Zap },
            { label: 'Memories', value: stats.totalMemories, Icon: Heart },
          ].map(({ label, value, Icon }) => (
            <Card key={label} className="border-border/50 bg-muted/10">
              <CardContent className="p-3 text-center">
                <Icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xl font-bold">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Insights */}
        <Card className="border-border bg-black">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" /> Reflection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.map((text, i) => (
              <div key={i} className="bg-muted/20 p-3 rounded-lg border border-border">
                <p className="text-sm text-foreground">{text}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Mood distribution */}
        {stats.totalEntries > 0 && (
          <Card className="border-border bg-black">
            <CardHeader>
              <CardTitle className="text-base">Mood Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(['positive', 'neutral', 'negative'] as Mood[]).map(m => {
                const count = stats.moodCounts[m] || 0;
                const pct = stats.totalEntries ? Math.round((count / stats.totalEntries) * 100) : 0;
                return (
                  <div key={m} className="flex items-center gap-3">
                    <span className="w-6 text-center">{moodEmoji[m]}</span>
                    <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', m === 'positive' ? 'bg-green-500' : m === 'neutral' ? 'bg-yellow-500' : 'bg-red-500')} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'today':         return renderToday();
      case 'timeline':      return renderTimeline();
      case 'memories':      return renderMemories();
      case 'thoughts':      return renderThoughts();
      case 'gratitude':     return renderGratitude();
      case 'achievements':  return renderAchievementsTab();
      case 'lessons':       return renderLessons();
      case 'goals':         return renderGoals();
      case 'ai-reflection': return renderReflection();
      default:              return null;
    }
  };

  return (
    <div className="w-full h-full bg-background flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-background">
        <div>
          <h2 className="font-semibold text-lg text-foreground">📔 Life Diary</h2>
          <p className="text-xs text-muted-foreground">Your personal AI-powered diary</p>
        </div>
      </div>

      {/* Main Layout with Sidebar */}
      <div className="flex-1 overflow-hidden flex">
        {/* Sidebar */}
        <div className="w-48 border-r border-border bg-muted/20 overflow-y-auto">
          <div className="p-3 space-y-1">
            {SIDEBAR_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium transition-all',
                  activeTab === id
                    ? 'bg-white text-black'
                    : 'text-foreground hover:bg-muted/40'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <ScrollArea className="h-full">
            <div className="p-6">
              {renderContent()}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

export default LifeDiaryEnhanced;
