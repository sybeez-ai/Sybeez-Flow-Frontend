/**
 * Daily Planner API Service
 * Syncs local daily life data with backend RAG system
 */

const DAILY_PLANNER_API_BASE = 'http://localhost:8000/api/daily-planner';
const DEFAULT_USER_ID = 'default_user';

export class DailyPlannerService {
  
  /**
   * Convert date string to ISO datetime format
   */
  private static toISODateTime(dateStr: string, timeStr?: string): string {
    const date = new Date(dateStr);
    if (timeStr) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      date.setHours(hours, minutes, 0, 0);
    } else {
      date.setHours(12, 0, 0, 0); // Default to noon
    }
    return date.toISOString();
  }

  /**
   * Map workout type to enum value
   */
  private static mapWorkoutType(type: string): string {
    const mapping: Record<string, string> = {
      'cardio': 'cardio',
      'strength': 'strength',
      'yoga': 'yoga',
      'stretching': 'stretching',
      'sports': 'sports'
    };
    return mapping[type.toLowerCase()] || 'other';
  }
  
  /**
   * Sync all daily life data to backend
   */
  static async syncDailyData(): Promise<void> {
    try {
      // Read from localStorage directly (where DailyLifePlanner stores data)
      const tasksData = localStorage.getItem('daily_tasks');
      const workoutsData = localStorage.getItem('gym_workouts');
      const dietData = localStorage.getItem('diet_plan');
      const waterData = localStorage.getItem('water_intake');
      
      const tasks = tasksData ? JSON.parse(tasksData) : [];
      const gymWorkouts = workoutsData ? JSON.parse(workoutsData) : [];
      const dietPlan = dietData ? JSON.parse(dietData) : [];
      const waterGlasses = waterData ? parseInt(waterData) : 4;
      
      const today = new Date().toISOString().split('T')[0];
      const todayISO = this.toISODateTime(today);
      
      // Sync tasks
      for (const task of tasks) {
        if (!task.completed) {
          try {
            await fetch(`${DAILY_PLANNER_API_BASE}/tasks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: DEFAULT_USER_ID,
                title: task.title || 'Untitled Task',
                description: '',
                due_date: this.toISODateTime(today, task.time || '12:00'),
                priority: task.priority || 'medium',
                status: 'pending',
                estimated_duration: 30,
                tags: [task.category || 'general']
              })
            });
          } catch (err) {
            console.warn('Failed to sync task:', err);
          }
        }
      }
      
      // Sync gym workouts (convert exercises to workout sessions)
      for (const workout of gymWorkouts) {
        try {
          await fetch(`${DAILY_PLANNER_API_BASE}/workouts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: DEFAULT_USER_ID,
              workout_type: 'strength', // Most exercises are strength training
              duration: (workout.sets || 3) * 2, // Estimate: 2 min per set
              date: todayISO,
              calories_burned: 0,
              notes: `${workout.exercise}: ${workout.sets}x${workout.reps}`,
              completed: workout.completed || false
            })
          });
        } catch (err) {
          console.warn('Failed to sync workout:', err);
        }
      }
      
      // Sync diet plan (meals)
      for (const meal of dietPlan) {
        try {
          // Extract meal type from meal description (e.g., "Breakfast: ...")
          const mealText = meal.meal || '';
          let mealType = 'snack';
          if (mealText.toLowerCase().includes('breakfast')) mealType = 'breakfast';
          else if (mealText.toLowerCase().includes('lunch')) mealType = 'lunch';
          else if (mealText.toLowerCase().includes('dinner')) mealType = 'dinner';
          
          await fetch(`${DAILY_PLANNER_API_BASE}/meals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: DEFAULT_USER_ID,
              meal_type: mealType,
              calories: meal.calories || 500,
              date: this.toISODateTime(today, meal.time || '12:00'),
              food_items: [mealText],
              notes: meal.completed ? 'Completed' : 'Pending'
            })
          });
        } catch (err) {
          console.warn('Failed to sync meal:', err);
        }
      }
      
      // Sync water intake
      try {
        await fetch(`${DAILY_PLANNER_API_BASE}/water/${DEFAULT_USER_ID}?glasses=${waterGlasses}&date=${today}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.warn('Failed to sync water:', err);
      }
      
      console.log('✅ Daily planner data synced successfully');
    } catch (error) {
      console.error('❌ Error syncing daily planner data:', error);
    }
  }
  
  /**
   * Query the daily planner assistant
   * This uses RAG - retrieves user's actual data
   */
  static async queryDailyPlannerAssistant(question: string): Promise<any> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const response = await fetch(`${DAILY_PLANNER_API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: DEFAULT_USER_ID,
          question: question,
          date: today
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error querying daily planner assistant:', error);
      throw error;
    }
  }
  
  /**
   * Get daily snapshot
   */
  static async getDailySnapshot(date?: string): Promise<any> {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      const response = await fetch(
        `${DAILY_PLANNER_API_BASE}/snapshot/${DEFAULT_USER_ID}?date=${targetDate}`,
        { method: 'GET' }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error getting daily snapshot:', error);
      throw error;
    }
  }
  
  /**
   * Get all tasks for user
   */
  static async getTasks(): Promise<any> {
    try {
      const response = await fetch(
        `${DAILY_PLANNER_API_BASE}/tasks/${DEFAULT_USER_ID}`,
        { method: 'GET' }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error getting tasks:', error);
      throw error;
    }
  }
}
