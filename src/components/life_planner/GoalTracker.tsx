/**
 * Goal Tracker Component
 * Track long-term goals with milestones and progress visualization
 */

import { useState } from "react";
import { 
  Target, 
  Plus, 
  Calendar,
  Trash2,
  Edit2,
  CheckCircle2,
  Circle,
  TrendingUp,
  Flag,
  Milestone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Goal, GoalMilestone } from "@/types/dailyLife";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface GoalTrackerProps {
  goals: Goal[];
  onAddGoal: (goal: Goal) => void;
  onUpdateGoal: (goal: Goal) => void;
  onDeleteGoal: (goalId: string) => void;
  onToggleMilestone: (goalId: string, milestoneId: string) => void;
  onAddMilestone: (goalId: string, milestone: GoalMilestone) => void;
}

const GOAL_CATEGORIES: { value: Goal['category']; label: string; color: string }[] = [
  { value: 'career', label: 'Career', color: 'bg-blue-500' },
  { value: 'health', label: 'Health', color: 'bg-green-500' },
  { value: 'learning', label: 'Learning', color: 'bg-purple-500' },
  { value: 'finance', label: 'Finance', color: 'bg-yellow-500' },
  { value: 'personal', label: 'Personal', color: 'bg-pink-500' },
  { value: 'fitness', label: 'Fitness', color: 'bg-orange-500' }
];

const GOAL_TYPES: { value: Goal['type']; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' }
];

export function GoalTracker({
  goals,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onToggleMilestone,
  onAddMilestone
}: GoalTrackerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [newGoal, setNewGoal] = useState({
    title: '',
    description: '',
    category: 'personal' as Goal['category'],
    type: 'monthly' as Goal['type'],
    targetValue: 100,
    currentValue: 0,
    unit: '',
    endDate: ''
  });
  const [newMilestone, setNewMilestone] = useState({ goalId: '', title: '', targetValue: 0 });

  const handleAddGoal = () => {
    if (!newGoal.title.trim()) {
      toast.error('Please enter a goal title');
      return;
    }
    if (!newGoal.endDate) {
      toast.error('Please set a target date');
      return;
    }

    const goal: Goal = {
      id: crypto.randomUUID(),
      title: newGoal.title,
      description: newGoal.description,
      category: newGoal.category,
      type: newGoal.type,
      targetValue: newGoal.targetValue,
      currentValue: newGoal.currentValue,
      unit: newGoal.unit,
      startDate: new Date().toISOString().split('T')[0],
      endDate: newGoal.endDate,
      isCompleted: false,
      milestones: [],
      color: GOAL_CATEGORIES.find(c => c.value === newGoal.category)?.color || 'bg-gray-500'
    };

    onAddGoal(goal);
    setNewGoal({
      title: '',
      description: '',
      category: 'personal',
      type: 'monthly',
      targetValue: 100,
      currentValue: 0,
      unit: '',
      endDate: ''
    });
    setShowAddForm(false);
    toast.success('Goal added!');
  };

  const handleAddMilestone = (goalId: string) => {
    if (!newMilestone.title.trim()) {
      toast.error('Please enter a milestone title');
      return;
    }

    const milestone: GoalMilestone = {
      id: crypto.randomUUID(),
      title: newMilestone.title,
      targetValue: newMilestone.targetValue,
      isCompleted: false
    };

    onAddMilestone(goalId, milestone);
    setNewMilestone({ goalId: '', title: '', targetValue: 0 });
    toast.success('Milestone added!');
  };

  const getProgress = (goal: Goal) => {
    if (goal.targetValue === 0) return 0;
    return Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const today = new Date();
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diff < 0) return { days: diff, label: `${Math.abs(diff)} days overdue`, color: 'text-red-500' };
    if (diff === 0) return { days: 0, label: 'Due today', color: 'text-orange-500' };
    if (diff <= 7) return { days: diff, label: `${diff} days left`, color: 'text-yellow-500' };
    return { days: diff, label: `${diff} days left`, color: 'text-gray-500' };
  };

  const getCategoryColor = (category: Goal['category']) => {
    return GOAL_CATEGORIES.find(c => c.value === category)?.color || 'bg-gray-500';
  };

  const activeGoals = goals.filter(g => !g.isCompleted);
  const completedGoals = goals.filter(g => g.isCompleted);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">Goal Tracker</h3>
          <Badge variant="secondary">{activeGoals.length} active</Badge>
        </div>
        <Button 
          size="sm" 
          onClick={() => setShowAddForm(!showAddForm)}
          variant={showAddForm ? "secondary" : "default"}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Goal
        </Button>
      </div>

      {/* Add Goal Form */}
      {showAddForm && (
        <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
          <Input
            placeholder="Goal title"
            value={newGoal.title}
            onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
          />
          <Textarea
            placeholder="Description (optional)"
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
                onChange={(e) => setNewGoal({ ...newGoal, category: e.target.value as Goal['category'] })}
              >
                {GOAL_CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Type</label>
              <select
                className="w-full px-3 py-2 rounded-md border bg-background"
                value={newGoal.type}
                onChange={(e) => setNewGoal({ ...newGoal, type: e.target.value as Goal['type'] })}
              >
                {GOAL_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Target Value</label>
              <Input
                type="number"
                value={newGoal.targetValue}
                onChange={(e) => setNewGoal({ ...newGoal, targetValue: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Unit</label>
              <Input
                placeholder="e.g., hours, books"
                value={newGoal.unit}
                onChange={(e) => setNewGoal({ ...newGoal, unit: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Target Date</label>
              <Input
                type="date"
                value={newGoal.endDate}
                onChange={(e) => setNewGoal({ ...newGoal, endDate: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button onClick={handleAddGoal}>Add Goal</Button>
          </div>
        </div>
      )}

      {/* Active Goals */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Active Goals</h4>
        
        {activeGoals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No active goals. Add one to get started!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeGoals.map(goal => {
              const progress = getProgress(goal);
              const daysInfo = getDaysRemaining(goal.endDate);
              const completedMilestones = goal.milestones?.filter(m => m.isCompleted).length || 0;
              const totalMilestones = goal.milestones?.length || 0;

              return (
                <div 
                  key={goal.id} 
                  className="p-4 border rounded-lg bg-card hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={cn("w-3 h-3 rounded-full", getCategoryColor(goal.category))} />
                        <h5 className="font-medium truncate">{goal.title}</h5>
                        <Badge variant="outline" className="text-xs">{goal.type}</Badge>
                      </div>
                      {goal.description && (
                        <p className="text-sm text-muted-foreground mb-2">{goal.description}</p>
                      )}
                      
                      {/* Progress */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>{goal.currentValue} / {goal.targetValue} {goal.unit}</span>
                          <span className="font-medium">{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>

                      {/* Timeline */}
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {goal.startDate} - {goal.endDate}
                        </span>
                        <span className={cn("flex items-center gap-1", daysInfo.color)}>
                          <Flag className="w-3 h-3" />
                          {daysInfo.label}
                        </span>
                      </div>

                      {/* Milestones */}
                      {goal.milestones && goal.milestones.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="flex items-center gap-2 mb-2">
                            <Milestone className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              Milestones ({completedMilestones}/{totalMilestones})
                            </span>
                          </div>
                          <div className="space-y-1">
                            {goal.milestones.map(milestone => (
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
                                <span className={cn(milestone.isCompleted && "line-through text-muted-foreground")}>
                                  {milestone.title}
                                  {milestone.targetValue > 0 && ` (${milestone.targetValue} ${goal.unit})`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Add Milestone */}
                      {newMilestone.goalId === goal.id ? (
                        <div className="mt-2 flex gap-2">
                          <Input
                            size={1}
                            placeholder="Milestone title"
                            value={newMilestone.title}
                            onChange={(e) => setNewMilestone({ ...newMilestone, title: e.target.value })}
                            className="text-sm h-8"
                          />
                          <Input
                            type="number"
                            placeholder="Target"
                            value={newMilestone.targetValue || ''}
                            onChange={(e) => setNewMilestone({ ...newMilestone, targetValue: parseInt(e.target.value) || 0 })}
                            className="w-20 text-sm h-8"
                          />
                          <Button size="sm" variant="ghost" onClick={() => handleAddMilestone(goal.id)} className="h-8">
                            Add
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setNewMilestone({ goalId: '', title: '', targetValue: 0 })} className="h-8">
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 text-xs"
                          onClick={() => setNewMilestone({ goalId: goal.id, title: '', targetValue: 0 })}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add Milestone
                        </Button>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1">
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => {
                          const updated = { ...goal, currentValue: Math.min(goal.currentValue + 1, goal.targetValue) };
                          onUpdateGoal(updated);
                        }}
                      >
                        <TrendingUp className="w-4 h-4 text-green-500" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => {
                          const updated = { ...goal, isCompleted: true };
                          onUpdateGoal(updated);
                          toast.success('Goal completed!');
                        }}
                      >
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => onDeleteGoal(goal.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed Goals */}
      {completedGoals.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Completed Goals ({completedGoals.length})
          </h4>
          <div className="space-y-2">
            {completedGoals.map(goal => (
              <div 
                key={goal.id} 
                className="p-3 border rounded-lg bg-muted/30 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="line-through text-muted-foreground">{goal.title}</span>
                  <Badge variant="outline" className="text-xs">{goal.category}</Badge>
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
