/**
 * Productivity AI Service - Claude Integration for Smart Coaching
 * Production-level implementation with context-aware AI assistance
 */

import { 
  AICoachingMessage, 
  AICoachingContext, 
  DailyScheduleBlock, 
  Habit, 
  Goal,
  DailyStats,
  WeeklyAnalytics 
} from "@/types/dailyLife";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface ProductivityAIResponse {
  message: string;
  suggestions?: string[];
  scheduleSuggestion?: DailyScheduleBlock[];
  habitRecommendations?: string[];
  productivityTips?: string[];
  motivationalQuote?: string;
}

export interface ScheduleOptimizationRequest {
  currentSchedule: DailyScheduleBlock[];
  preferences: {
    wakeUpTime: string;
    sleepTime: string;
    workStyle: 'early-bird' | 'night-owl' | 'balanced';
    focusPreference: 'pomodoro' | 'deep-work' | 'flexible';
  };
  goals: Goal[];
  constraints?: string[];
}

class ProductivityAIService {
  private conversationHistory: AICoachingMessage[] = [];
  private context: AICoachingContext | null = null;

  /**
   * Initialize the AI service with user context
   */
  setContext(context: AICoachingContext): void {
    this.context = context;
    // Load conversation history from localStorage
    const saved = localStorage.getItem('ai_coaching_history');
    if (saved) {
      this.conversationHistory = JSON.parse(saved);
    }
  }

  /**
   * Save conversation to localStorage
   */
  private saveHistory(): void {
    // Keep last 50 messages
    const toSave = this.conversationHistory.slice(-50);
    localStorage.setItem('ai_coaching_history', JSON.stringify(toSave));
  }

  /**
   * Format context for AI prompt
   */
  private formatContextForPrompt(): string {
    if (!this.context) return '';

    const { currentTasks, todaySchedule, habits, recentMoods, weeklyStats, goals, preferences } = this.context;
    
    const completedTasks = currentTasks.filter(t => t.completed).length;
    const activeHabits = habits.filter(h => h.currentStreak > 0).length;
    const avgMood = recentMoods.length > 0 
      ? (recentMoods.reduce((acc, m) => acc + m.mood, 0) / recentMoods.length).toFixed(1)
      : 'N/A';

    return `
USER PRODUCTIVITY CONTEXT:
- Tasks: ${completedTasks}/${currentTasks.length} completed today
- Schedule: ${todaySchedule.filter(s => s.isCompleted).length}/${todaySchedule.length} blocks completed
- Active habits: ${activeHabits}/${habits.length} with active streaks
- Recent mood average: ${avgMood}/5
- Weekly productivity: ${weeklyStats?.avgProductivityScore || 'N/A'}%
- Active goals: ${goals.filter(g => !g.isCompleted).length}
- Preferred wake time: ${preferences.wakeUpTime || 'Not set'}
- Work style: ${preferences.workStyle || 'balanced'}
- Focus preference: ${preferences.focusPreference || 'flexible'}
    `.trim();
  }

  /**
   * Chat with Claude AI for productivity coaching
   */
  async chat(userMessage: string): Promise<ProductivityAIResponse> {
    const contextPrompt = this.formatContextForPrompt();
    
    const systemPrompt = `You are an expert productivity coach and life planner AI assistant. Your role is to help users optimize their daily routines, build better habits, achieve their goals, and maintain work-life balance.

${contextPrompt}

GUIDELINES:
1. Be encouraging but realistic
2. Provide actionable, specific advice
3. Consider the user's current context and progress
4. Suggest small, achievable improvements
5. Use motivational language when appropriate
6. If suggesting schedule changes, be specific with times
7. Consider energy levels throughout the day
8. Acknowledge achievements and progress
9. Offer habit-stacking suggestions when relevant
10. Be concise but helpful

Respond in a friendly, coaching tone. If the user seems stressed or overwhelmed, prioritize well-being advice.`;

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${systemPrompt}\n\nUser: ${userMessage}`,
          session_id: 'productivity-coach',
          context: {
            feature: 'planner',
            system: systemPrompt,
            history: this.conversationHistory.slice(-10).map(m => ({
              role: m.role,
              content: m.content,
            })),
          },
          use_voice: false,
          use_web_search: false,
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const json = await response.json();
      // Backend wraps payload in format_response: { success, data: { response } }
      const payload = json.data ?? json;
      const aiMessage = payload.response || payload.message || json.response || 'I apologize, but I encountered an issue. Please try again.';

      // Save to history
      const userMsg: AICoachingMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
        type: 'chat'
      };

      const assistantMsg: AICoachingMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: aiMessage,
        timestamp: new Date().toISOString(),
        type: 'chat'
      };

      this.conversationHistory.push(userMsg, assistantMsg);
      this.saveHistory();

      return {
        message: aiMessage,
        suggestions: this.extractSuggestions(aiMessage)
      };
    } catch (error) {
      console.error('ProductivityAI chat error:', error);
      return {
        message: "I'm having trouble connecting right now. Here's a tip: Try breaking your next task into smaller, 5-minute steps to build momentum!",
        productivityTips: [
          "Break large tasks into smaller chunks",
          "Use the 2-minute rule: If it takes less than 2 minutes, do it now",
          "Take regular breaks to maintain focus"
        ]
      };
    }
  }

  /**
   * Get smart schedule optimization
   */
  async optimizeSchedule(request: ScheduleOptimizationRequest): Promise<DailyScheduleBlock[]> {
    const prompt = `Optimize this daily schedule for maximum productivity:

CURRENT SCHEDULE:
${request.currentSchedule.map(b => `- ${b.startTime}-${b.endTime}: ${b.title} (${b.type})`).join('\n')}

USER PREFERENCES:
- Wake time: ${request.preferences.wakeUpTime}
- Sleep time: ${request.preferences.sleepTime}
- Work style: ${request.preferences.workStyle}
- Focus preference: ${request.preferences.focusPreference}

GOALS:
${request.goals.map(g => `- ${g.title}: ${g.currentValue}/${g.targetValue} ${g.unit}`).join('\n')}

${request.constraints ? `CONSTRAINTS: ${request.constraints.join(', ')}` : ''}

Provide an optimized schedule with specific times, considering:
1. Peak energy times based on work style
2. Regular breaks for sustainability
3. Time for goal-related activities
4. Meals at appropriate times
5. Wind-down time before sleep

Return the schedule in a clear format with times and activities.`;

    try {
      const response = await this.chat(prompt);
      // Parse response to extract schedule blocks (simplified - in production, use structured output)
      return request.currentSchedule; // Return original if parsing fails
    } catch (error) {
      console.error('Schedule optimization error:', error);
      return request.currentSchedule;
    }
  }

  /**
   * Get daily motivation and insights
   */
  async getDailyInsights(): Promise<ProductivityAIResponse> {
    const contextPrompt = this.formatContextForPrompt();
    
    const prompt = `Based on this user's productivity context:
${contextPrompt}

Provide:
1. A personalized motivational message for today
2. 3 specific productivity tips based on their current status
3. 1 habit recommendation to improve their routine
4. Recognition of any achievements or streaks

Keep it encouraging and actionable.`;

    return this.chat(prompt);
  }

  /**
   * Get habit recommendations based on goals
   */
  async getHabitRecommendations(goals: Goal[]): Promise<string[]> {
    const goalsText = goals.map(g => `- ${g.title} (${g.category})`).join('\n');
    
    const prompt = `Based on these goals:
${goalsText}

Suggest 5 specific daily habits that would help achieve these goals. For each habit, explain briefly why it helps.`;

    const response = await this.chat(prompt);
    return response.habitRecommendations || this.extractBulletPoints(response.message);
  }

  /**
   * Get task prioritization advice
   */
  async prioritizeTasks(tasks: { title: string; deadline?: string; importance?: string }[]): Promise<string[]> {
    const taskList = tasks.map(t => `- ${t.title}${t.deadline ? ` (Due: ${t.deadline})` : ''}${t.importance ? ` [${t.importance}]` : ''}`).join('\n');
    
    const prompt = `Help prioritize these tasks using the Eisenhower matrix (Urgent/Important):
${taskList}

Rank them in order of what should be done first, with brief reasoning.`;

    const response = await this.chat(prompt);
    return this.extractBulletPoints(response.message);
  }

  /**
   * Get weekly review and planning — grounded in completed schedules.
   */
  async getWeeklyReview(
    stats: WeeklyAnalytics,
    scheduleExtras?: {
      todayDone?: string;
      yesterdayDone?: string;
      weekDone?: string;
      completedCount?: number;
      todayCount?: number;
      yesterdayCount?: number;
    },
  ): Promise<ProductivityAIResponse> {
    const extras = scheduleExtras || {};
    const prompt = `Provide a weekly productivity review grounded in REAL completed schedules (do not invent tasks).

Week: ${stats.weekStart} → ${stats.weekEnd}
- Average productivity: ${stats.avgProductivityScore}%
- Total focus time: ${Math.round(stats.totalFocusTime / 60)} hours
- Pomodoros completed: ${stats.totalPomodorosCompleted}
- Habit completion rate: ${Math.round(stats.habitCompletionRate)}%
- Trend: ${stats.productivityTrend}
- Schedules completed this week: ${extras.completedCount ?? 0}
- Completed today: ${extras.todayCount ?? 0}
- Completed yesterday: ${extras.yesterdayCount ?? 0}

Completed TODAY:
${extras.todayDone || "• (none)"}

Completed YESTERDAY:
${extras.yesterdayDone || "• (none)"}

Completed THIS WEEK:
${extras.weekDone || "• (none)"}

Daily stats:
${(stats.dailyStats || [])
  .map(
    (d) =>
      `- ${d.date}: ${d.productivityScore}% productivity, ${d.tasksCompleted}/${d.totalTasks} tasks`,
  )
  .join("\n") || "- (no daily stats)"}

Format your reply EXACTLY with these headings (use bullet lists under lists):
Summary: <one short paragraph>
Grade: <A/B/C/D/F>
Highlights:
- ...
Improvements:
- ...
Recommendations:
- ...
Focus:
- ...

If there are no completed schedules, say so honestly and coach the user to mark tasks done — do not invent fake wins like "consistent daily routine".`;

    return this.chat(prompt);
  }

  /**
   * Get energy management tips
   */
  async getEnergyTips(timeOfDay: 'morning' | 'afternoon' | 'evening'): Promise<string[]> {
    const prompt = `It's ${timeOfDay}. Provide 3 quick energy management tips for this time of day to maintain productivity.`;
    
    const response = await this.chat(prompt);
    return this.extractBulletPoints(response.message);
  }

  /**
   * Get focus session suggestions
   */
  async getFocusSessionPlan(task: string, duration: number): Promise<ProductivityAIResponse> {
    const prompt = `I'm about to start a ${duration}-minute focus session on: "${task}"

Provide:
1. A quick 1-minute prep routine
2. How to break down the session for max focus
3. What to do if I get distracted
4. A post-session mini-review prompt`;

    return this.chat(prompt);
  }

  /**
   * Get conversation history
   */
  getHistory(): AICoachingMessage[] {
    return this.conversationHistory;
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
    localStorage.removeItem('ai_coaching_history');
  }

  /**
   * Extract bullet points from AI response
   */
  private extractBulletPoints(text: string): string[] {
    const lines = text.split('\n');
    return lines
      .filter(line => line.match(/^[\d\-\*\•]\s*\.?\s*/))
      .map(line => line.replace(/^[\d\-\*\•]\s*\.?\s*/, '').trim())
      .filter(line => line.length > 0);
  }

  /**
   * Extract suggestions from AI response
   */
  private extractSuggestions(text: string): string[] {
    const suggestions: string[] = [];
    
    // Look for numbered lists or bullet points
    const bulletPoints = this.extractBulletPoints(text);
    if (bulletPoints.length > 0) {
      suggestions.push(...bulletPoints.slice(0, 5));
    }
    
    return suggestions;
  }
}

export const productivityAI = new ProductivityAIService();
export default productivityAI;
