/**
 * Goal Tracker — progress logs, milestones, schedule links, AI-ready reports.
 */

import { useMemo, useState } from "react";
import {
  Target,
  Plus,
  Calendar,
  Trash2,
  CheckCircle2,
  Circle,
  Flag,
  Milestone,
  Minus,
  CalendarPlus,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Goal, GoalMilestone } from "@/types/dailyLife";
import {
  appendProgressLog,
  goalPercent,
  recentLogs,
  todayDelta,
  todayISO,
} from "@/services/goalProgressService";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface GoalTrackerProps {
  goals: Goal[];
  onAddGoal: (goal: Goal) => void;
  onUpdateGoal: (goal: Goal) => void;
  onDeleteGoal: (goalId: string) => void;
  onToggleMilestone: (goalId: string, milestoneId: string) => void;
  onAddMilestone: (goalId: string, milestone: GoalMilestone) => void;
  onAddToSchedule?: (goal: Goal, title: string) => void;
  onAskCoach?: (prompt: string) => void;
}

const GOAL_CATEGORIES: { value: Goal["category"]; label: string; color: string }[] = [
  { value: "career", label: "Career", color: "bg-blue-500" },
  { value: "health", label: "Health", color: "bg-green-500" },
  { value: "learning", label: "Learning", color: "bg-purple-500" },
  { value: "finance", label: "Finance", color: "bg-yellow-500" },
  { value: "personal", label: "Personal", color: "bg-pink-500" },
  { value: "fitness", label: "Fitness", color: "bg-orange-500" },
];

const GOAL_TYPES: { value: Goal["type"]; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export function GoalTracker({
  goals,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onToggleMilestone,
  onAddMilestone,
  onAddToSchedule,
  onAskCoach,
}: GoalTrackerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [logGoalId, setLogGoalId] = useState<string | null>(null);
  const [logDelta, setLogDelta] = useState("1");
  const [logNote, setLogNote] = useState("");
  const [newGoal, setNewGoal] = useState({
    title: "",
    description: "",
    category: "personal" as Goal["category"],
    type: "monthly" as Goal["type"],
    targetValue: 100,
    unit: "",
    endDate: "",
  });
  const [newMilestone, setNewMilestone] = useState({
    goalId: "",
    title: "",
    targetValue: 0,
  });

  const handleAddGoal = () => {
    if (!newGoal.title.trim()) {
      toast.error("Please enter a goal title");
      return;
    }
    if (!newGoal.endDate) {
      toast.error("Please set a target date");
      return;
    }
    const target = Math.max(1, Number(newGoal.targetValue) || 100);
    const goal: Goal = {
      id: crypto.randomUUID(),
      title: newGoal.title.trim(),
      description: newGoal.description.trim() || undefined,
      category: newGoal.category,
      type: newGoal.type,
      targetValue: target,
      currentValue: 0,
      unit: newGoal.unit.trim() || "units",
      startDate: todayISO(),
      endDate: newGoal.endDate,
      isCompleted: false,
      milestones: [],
      progressLogs: [],
      color:
        GOAL_CATEGORIES.find((c) => c.value === newGoal.category)?.color ||
        "bg-gray-500",
    };
    onAddGoal(goal);
    setNewGoal({
      title: "",
      description: "",
      category: "personal",
      type: "monthly",
      targetValue: 100,
      unit: "",
      endDate: "",
    });
    setShowAddForm(false);
    toast.success("Goal added — log progress daily or ask your coach for a plan");
  };

  const handleAddMilestone = (goalId: string) => {
    if (!newMilestone.title.trim()) {
      toast.error("Please enter a milestone title");
      return;
    }
    onAddMilestone(goalId, {
      id: crypto.randomUUID(),
      title: newMilestone.title.trim(),
      targetValue: Math.max(0, Number(newMilestone.targetValue) || 0),
      isCompleted: false,
    });
    setNewMilestone({ goalId: "", title: "", targetValue: 0 });
    toast.success("Milestone added");
  };

  const saveLog = (goal: Goal) => {
    const delta = Number(logDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      toast.error("Enter a non-zero progress amount");
      return;
    }
    const updated = appendProgressLog(goal, {
      delta,
      note: logNote,
      source: "manual",
    });
    onUpdateGoal(updated);
    setLogGoalId(null);
    setLogDelta("1");
    setLogNote("");
    toast.success(`Logged ${delta > 0 ? "+" : ""}${delta} ${goal.unit || ""}`);
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0)
      return {
        label: `${Math.abs(diff)} days overdue`,
        color: "text-red-500",
      };
    if (diff === 0) return { label: "Due today", color: "text-orange-500" };
    if (diff <= 7) return { label: `${diff} days left`, color: "text-yellow-500" };
    return { label: `${diff} days left`, color: "text-muted-foreground" };
  };

  const activeGoals = useMemo(() => goals.filter((g) => !g.isCompleted), [goals]);
  const completedGoals = useMemo(() => goals.filter((g) => g.isCompleted), [goals]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">Goal Tracker</h3>
          <Badge variant="secondary">{activeGoals.length} active</Badge>
        </div>
        <div className="flex gap-2">
          {onAskCoach && activeGoals.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAskCoach("Give me today's daily goal report")}
            >
              <FileText className="w-4 h-4 mr-1" />
              Daily report
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            variant={showAddForm ? "secondary" : "default"}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Goal
          </Button>
        </div>
      </div>

      {showAddForm && (
        <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
          <Input
            placeholder="Goal title (e.g. Become a pilot)"
            value={newGoal.title}
            onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
          />
          <Textarea
            placeholder="Why this matters / what success looks like"
            value={newGoal.description}
            onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
            rows={2}
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Category</label>
              <select
                className="w-full px-3 py-2 rounded-md border bg-background"
                value={newGoal.category}
                onChange={(e) =>
                  setNewGoal({
                    ...newGoal,
                    category: e.target.value as Goal["category"],
                  })
                }
              >
                {GOAL_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Type</label>
              <select
                className="w-full px-3 py-2 rounded-md border bg-background"
                value={newGoal.type}
                onChange={(e) =>
                  setNewGoal({ ...newGoal, type: e.target.value as Goal["type"] })
                }
              >
                {GOAL_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Target</label>
              <Input
                type="number"
                min={1}
                value={newGoal.targetValue}
                onChange={(e) =>
                  setNewGoal({
                    ...newGoal,
                    targetValue: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Unit</label>
              <Input
                placeholder="hours, lessons, %"
                value={newGoal.unit}
                onChange={(e) => setNewGoal({ ...newGoal, unit: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Target date</label>
              <Input
                type="date"
                value={newGoal.endDate}
                onChange={(e) => setNewGoal({ ...newGoal, endDate: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddGoal}>Add Goal</Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Active Goals
        </h4>

        {activeGoals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No active goals. Add one, then log progress or ask your coach for a plan.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeGoals.map((goal) => {
              const progress = goalPercent(goal);
              const daysInfo = getDaysRemaining(goal.endDate);
              const completedMilestones =
                goal.milestones?.filter((m) => m.isCompleted).length || 0;
              const totalMilestones = goal.milestones?.length || 0;
              const today = todayDelta(goal);
              const history = recentLogs(goal, 7);
              const catColor =
                GOAL_CATEGORIES.find((c) => c.value === goal.category)?.color ||
                "bg-gray-500";

              return (
                <div
                  key={goal.id}
                  className="p-4 border rounded-lg bg-card hover:shadow-md transition-shadow space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <div className={cn("w-3 h-3 rounded-full", catColor)} />
                        <h5 className="font-medium truncate">{goal.title}</h5>
                        <Badge variant="outline" className="text-xs">
                          {goal.type}
                        </Badge>
                      </div>
                      {goal.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {goal.description}
                        </p>
                      )}

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>
                            {goal.currentValue} / {goal.targetValue} {goal.unit}
                          </span>
                          <span className="font-medium">{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                        <p className="text-[11px] text-muted-foreground">
                          Today{" "}
                          <span className="font-medium text-foreground">
                            {today >= 0 ? "+" : ""}
                            {today} {goal.unit}
                          </span>
                          {totalMilestones > 0 && (
                            <>
                              {" "}
                              · Milestones {completedMilestones}/{totalMilestones}
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {goal.startDate} → {goal.endDate}
                        </span>
                        <span className={cn("flex items-center gap-1", daysInfo.color)}>
                          <Flag className="w-3 h-3" />
                          {daysInfo.label}
                        </span>
                      </div>
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onDeleteGoal(goal.id)}
                      title="Delete goal"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>

                  {/* Log progress */}
                  {logGoalId === goal.id ? (
                    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                      <p className="text-xs font-medium">Log today’s progress</p>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={logDelta}
                          onChange={(e) => setLogDelta(e.target.value)}
                          className="h-8 w-24"
                          placeholder="+1"
                        />
                        <Input
                          value={logNote}
                          onChange={(e) => setLogNote(e.target.value)}
                          className="h-8 flex-1"
                          placeholder="What did you do?"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveLog(goal)}>
                          Save log
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setLogGoalId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setLogGoalId(goal.id);
                          setLogDelta("1");
                          setLogNote("");
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Log progress
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onUpdateGoal(
                            appendProgressLog(goal, { delta: 1, source: "manual", note: "+1" }),
                          );
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" />1
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (goal.currentValue <= 0) return;
                          onUpdateGoal(
                            appendProgressLog(goal, {
                              delta: -1,
                              source: "manual",
                              note: "-1",
                            }),
                          );
                        }}
                      >
                        <Minus className="w-3 h-3 mr-1" />1
                      </Button>
                      {onAddToSchedule && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            onAddToSchedule(goal, `Work on: ${goal.title}`)
                          }
                        >
                          <CalendarPlus className="w-3 h-3 mr-1" />
                          Add to schedule
                        </Button>
                      )}
                      {onAskCoach && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              onAskCoach(
                                `How much progress have I made on my goal "${goal.title}"? What should I improve next?`,
                              )
                            }
                          >
                            Ask progress
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              onAskCoach(
                                `Create a date-wise plan to achieve my goal "${goal.title}" and add today's tasks to my schedule.`,
                              )
                            }
                          >
                            Make plan
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          onUpdateGoal({
                            ...goal,
                            currentValue: goal.targetValue,
                            isCompleted: true,
                          });
                          toast.success("Goal completed!");
                        }}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Complete
                      </Button>
                    </div>
                  )}

                  {/* Date-wise history */}
                  {history.length > 0 && (
                    <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                        Last 7 days
                      </p>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {history.map((l) => (
                          <div
                            key={l.id}
                            className="flex items-center justify-between text-[11px] gap-2"
                          >
                            <span className="text-muted-foreground">{l.date}</span>
                            <span className="font-medium tabular-nums">
                              {l.delta > 0 ? "+" : ""}
                              {l.delta} {goal.unit}
                            </span>
                            <span className="truncate text-muted-foreground flex-1 text-right">
                              {l.note || l.source}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Milestones */}
                  <div className="pt-2 border-t border-border/60">
                    <div className="flex items-center gap-2 mb-2">
                      <Milestone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        Milestones ({completedMilestones}/{totalMilestones})
                      </span>
                    </div>
                    {(goal.milestones || []).length > 0 && (
                      <div className="space-y-1 mb-2">
                        {(goal.milestones || []).map((milestone) => (
                          <div
                            key={milestone.id}
                            className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded"
                            onClick={() => onToggleMilestone(goal.id, milestone.id)}
                          >
                            {milestone.isCompleted ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <Circle className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span
                              className={cn(
                                milestone.isCompleted &&
                                  "line-through text-muted-foreground",
                              )}
                            >
                              {milestone.title}
                              {milestone.targetValue > 0 &&
                                ` (${milestone.targetValue} ${goal.unit})`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {newMilestone.goalId === goal.id ? (
                      <div className="flex gap-2 flex-wrap">
                        <Input
                          placeholder="Milestone title"
                          value={newMilestone.title}
                          onChange={(e) =>
                            setNewMilestone({ ...newMilestone, title: e.target.value })
                          }
                          className="text-sm h-8 flex-1 min-w-[140px]"
                        />
                        <Input
                          type="number"
                          placeholder="Value"
                          value={newMilestone.targetValue || ""}
                          onChange={(e) =>
                            setNewMilestone({
                              ...newMilestone,
                              targetValue: parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className="w-20 text-sm h-8"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAddMilestone(goal.id)}
                          className="h-8"
                        >
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setNewMilestone({ goalId: "", title: "", targetValue: 0 })
                          }
                          className="h-8"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                        onClick={() =>
                          setNewMilestone({ goalId: goal.id, title: "", targetValue: 0 })
                        }
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Milestone
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {completedGoals.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Completed Goals ({completedGoals.length})
          </h4>
          <div className="space-y-2">
            {completedGoals.map((goal) => (
              <div
                key={goal.id}
                className="p-3 border rounded-lg bg-muted/30 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="line-through text-muted-foreground">{goal.title}</span>
                  <Badge variant="outline" className="text-xs">
                    {goalPercent(goal)}%
                  </Badge>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDeleteGoal(goal.id)}
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default GoalTracker;
