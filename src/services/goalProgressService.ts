import type { Goal, GoalMilestone, GoalProgressLog } from "@/types/dailyLife";

export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function goalPercent(goal: Goal): number {
  const target = Number(goal.targetValue) || 0;
  if (target <= 0) return 0;
  return Math.min(100, Math.round((Number(goal.currentValue) || 0) / target * 100));
}

/** Milestone-based progress toward target (sum of completed milestone targets). */
export function milestoneProgressValue(goal: Goal): number {
  const milestones = goal.milestones || [];
  if (!milestones.length) return 0;
  const withTargets = milestones.filter((m) => (m.targetValue || 0) > 0);
  if (withTargets.length) {
    return withTargets
      .filter((m) => m.isCompleted)
      .reduce((s, m) => s + (Number(m.targetValue) || 0), 0);
  }
  // Equal weight when milestones have no target values
  const done = milestones.filter((m) => m.isCompleted).length;
  const target = Number(goal.targetValue) || milestones.length;
  return Math.round((done / milestones.length) * target);
}

export function recomputeCurrentValue(goal: Goal): number {
  const fromLogs = (goal.progressLogs || []).reduce(
    (s, l) => s + (Number(l.delta) || 0),
    0,
  );
  const fromMilestones = milestoneProgressValue(goal);
  // Prefer the richer of log-sum vs milestone progress (avoids double-count when both exist)
  const hasManualLogs = (goal.progressLogs || []).some(
    (l) => l.source === "manual" || l.source === "schedule" || l.source === "ai",
  );
  if (hasManualLogs) {
    return Math.max(0, Math.min(Number(goal.targetValue) || Infinity, fromLogs));
  }
  if ((goal.milestones || []).length) {
    return Math.max(0, Math.min(Number(goal.targetValue) || Infinity, fromMilestones));
  }
  return Math.max(0, Number(goal.currentValue) || 0);
}

export function logsForDate(goal: Goal, date: string): GoalProgressLog[] {
  return (goal.progressLogs || []).filter((l) => l.date === date);
}

export function todayDelta(goal: Goal, date = todayISO()): number {
  return logsForDate(goal, date).reduce((s, l) => s + (Number(l.delta) || 0), 0);
}

export function recentLogs(goal: Goal, days = 14): GoalProgressLog[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const start = todayISO(cutoff);
  return (goal.progressLogs || [])
    .filter((l) => l.date >= start)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function appendProgressLog(
  goal: Goal,
  input: {
    delta: number;
    note?: string;
    source?: GoalProgressLog["source"];
    date?: string;
    milestoneId?: string;
    scheduleBlockId?: string;
  },
): Goal {
  const delta = Number(input.delta) || 0;
  if (!delta) return goal;
  const log: GoalProgressLog = {
    id: `gpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: input.date || todayISO(),
    delta,
    note: input.note?.trim() || undefined,
    source: input.source || "manual",
    milestoneId: input.milestoneId,
    scheduleBlockId: input.scheduleBlockId,
  };
  const progressLogs = [...(goal.progressLogs || []), log];
  const next: Goal = {
    ...goal,
    progressLogs,
    currentValue: 0, // recomputed below
  };
  next.currentValue = recomputeCurrentValue(next);
  if (next.currentValue >= (next.targetValue || 0) && (next.targetValue || 0) > 0) {
    next.isCompleted = true;
  }
  return next;
}

export function toggleMilestoneSynced(
  goal: Goal,
  milestoneId: string,
): Goal {
  const milestones = (goal.milestones || []).map((m) => {
    if (m.id !== milestoneId) return m;
    const isCompleted = !m.isCompleted;
    return {
      ...m,
      isCompleted,
      completedAt: isCompleted ? new Date().toISOString() : undefined,
    };
  });
  const toggled = milestones.find((m) => m.id === milestoneId);
  let next: Goal = { ...goal, milestones };

  if (toggled) {
    const weight =
      (toggled.targetValue || 0) > 0
        ? Number(toggled.targetValue)
        : Math.max(
            1,
            Math.round((Number(goal.targetValue) || milestones.length) / Math.max(1, milestones.length)),
          );
    if (toggled.isCompleted) {
      next = appendProgressLog(next, {
        delta: weight,
        note: `Milestone: ${toggled.title}`,
        source: "milestone",
        milestoneId,
      });
    } else {
      // Remove last matching milestone log or apply negative delta
      const logs = [...(next.progressLogs || [])];
      const idx = [...logs]
        .reverse()
        .findIndex((l) => l.milestoneId === milestoneId && l.delta > 0);
      if (idx >= 0) {
        const realIdx = logs.length - 1 - idx;
        logs.splice(realIdx, 1);
        next = { ...next, progressLogs: logs };
        next.currentValue = recomputeCurrentValue(next);
      } else {
        next = appendProgressLog(next, {
          delta: -weight,
          note: `Unchecked milestone: ${toggled.title}`,
          source: "milestone",
          milestoneId,
        });
      }
      next.isCompleted = false;
    }
  }

  next.currentValue = recomputeCurrentValue(next);
  return next;
}

export function goalSnapshotForAI(goals: Goal[]) {
  const today = todayISO();
  return (goals || []).map((g) => {
    const milestones = g.milestones || [];
    const doneMs = milestones.filter((m) => m.isCompleted).length;
    const logs = recentLogs(g, 7);
    return {
      id: g.id,
      title: g.title,
      category: g.category,
      type: g.type,
      unit: g.unit,
      currentValue: g.currentValue,
      targetValue: g.targetValue,
      percent: goalPercent(g),
      isCompleted: g.isCompleted,
      startDate: g.startDate,
      endDate: g.endDate,
      milestonesDone: doneMs,
      milestonesTotal: milestones.length,
      milestones: milestones.map((m) => ({
        id: m.id,
        title: m.title,
        targetValue: m.targetValue,
        isCompleted: m.isCompleted,
      })),
      todayDelta: todayDelta(g, today),
      recentLogs: logs.map((l) => ({
        date: l.date,
        delta: l.delta,
        note: l.note,
        source: l.source,
      })),
    };
  });
}

export function buildDailyGoalReport(goals: Goal[], date = todayISO()): string {
  const active = (goals || []).filter((g) => !g.isCompleted);
  if (!active.length) {
    return `## Daily goal report — ${date}\n\nNo active goals yet. Add a goal in Life Planner → Goals.`;
  }
  const lines = [`## Daily goal report — ${date}`, ""];
  for (const g of active) {
    const pct = goalPercent(g);
    const delta = todayDelta(g, date);
    const ms = g.milestones || [];
    const doneMs = ms.filter((m) => m.isCompleted).length;
    lines.push(`### ${g.title}`);
    lines.push(
      `- Progress: **${g.currentValue} / ${g.targetValue} ${g.unit || ""}** (${pct}%)`,
    );
    lines.push(`- Today: **${delta >= 0 ? "+" : ""}${delta} ${g.unit || ""}**`);
    if (ms.length) lines.push(`- Milestones: ${doneMs}/${ms.length}`);
    const todayNotes = logsForDate(g, date)
      .map((l) => l.note)
      .filter(Boolean);
    if (todayNotes.length) lines.push(`- Notes: ${todayNotes.join("; ")}`);
    if (pct < 30) lines.push("- Focus: take one small step today toward this goal.");
    else if (pct < 70) lines.push("- Focus: keep the streak — schedule one block today.");
    else lines.push("- Focus: finish strong — close a milestone if you can.");
    lines.push("");
  }
  return lines.join("\n");
}
