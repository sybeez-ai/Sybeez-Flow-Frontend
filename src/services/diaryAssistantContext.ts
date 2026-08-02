/**
 * Compact Life Diary context for Life Companion Q&A + agentic writes.
 */
import { usGetItem } from "@/services/userStorage";

function readJSON(key: string): unknown {
  try {
    return JSON.parse(usGetItem(key) || "null");
  } catch {
    return null;
  }
}

export function buildDiaryAssistantContext(opts?: {
  activeTab?: string;
}): Record<string, unknown> {
  const diary = (readJSON("sybeez_life_diary") as Record<string, any>) || {
    entries: [],
    memories: [],
    thoughts: [],
    gratitude: [],
    growthMetrics: [],
    weeklyReflections: [],
  };

  const entries = Array.isArray(diary.entries) ? diary.entries : [];
  const thoughts = Array.isArray(diary.thoughts) ? diary.thoughts : [];
  const memories = Array.isArray(diary.memories) ? diary.memories : [];
  const gratitude = Array.isArray(diary.gratitude) ? diary.gratitude : [];
  const achievements = memories.filter((m: any) =>
    ["achievement", "milestone", "certificate"].includes(
      String(m?.category || "").toLowerCase(),
    ),
  );

  const diarySnapshot = {
    counts: {
      entries: entries.length,
      thoughts: thoughts.length,
      memories: memories.length,
      gratitude: gratitude.length,
      achievements: achievements.length,
    },
    recent_entries: entries.slice(0, 12).map((e: any) => ({
      id: e.id,
      date: e.date,
      title: e.title,
      mood: e.mood,
      energy: e.energy,
      content: String(e.content || "").slice(0, 400),
      highlights: e.highlights || [],
      challenges: e.challenges || [],
      summary: e.summary,
    })),
    recent_thoughts: thoughts.slice(0, 12).map((t: any) => ({
      id: t.id,
      date: t.date,
      category: t.category,
      content: String(t.content || "").slice(0, 280),
    })),
    recent_memories: memories.slice(0, 12).map((m: any) => ({
      id: m.id,
      date: m.date,
      title: m.title,
      category: m.category,
      description: String(m.description || "").slice(0, 220),
    })),
    recent_gratitude: gratitude.slice(0, 12).map((g: any) => ({
      id: g.id,
      date: g.date,
      items: g.items || [],
    })),
    recent_achievements: achievements.slice(0, 8).map((m: any) => ({
      id: m.id,
      date: m.date,
      title: m.title,
      description: String(m.description || "").slice(0, 220),
    })),
  };

  return {
    feature: "diary",
    diary,
    diarySnapshot,
    activeTab: opts?.activeTab || "",
    pathname:
      typeof window !== "undefined" ? window.location.pathname : "/diary",
    page: {
      view: "diary",
      tab: opts?.activeTab || "",
      path: "/diary",
    },
  };
}
