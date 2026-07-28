import { DailyLifeData, GymSchedule, HygieneRoutine, MealPlan, MentalHealthSchedule, WorkBlock, SleepSchedule, DailyScheduleBlock } from "@/types/dailyLife";

const STORAGE_KEY = "daily_life_data";

export class DailyLifeService {
  
  static getData(): DailyLifeData {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
    return {
      gymSchedules: [],
      hygieneRoutines: [],
      mealPlans: [],
      mentalHealthSchedules: [],
      workBlocks: [],
      dailySchedule: [],
      preferences: {}
    };
  }

  static saveData(data: DailyLifeData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // Gym Schedules
  static addGymSchedule(schedule: GymSchedule): void {
    const data = this.getData();
    data.gymSchedules.push(schedule);
    this.saveData(data);
    this.regenerateDailySchedule();
  }

  static updateGymSchedule(id: string, updates: Partial<GymSchedule>): void {
    const data = this.getData();
    const index = data.gymSchedules.findIndex(g => g.id === id);
    if (index !== -1) {
      data.gymSchedules[index] = { ...data.gymSchedules[index], ...updates };
      this.saveData(data);
      this.regenerateDailySchedule();
    }
  }

  // Hygiene Routines
  static addHygieneRoutine(routine: HygieneRoutine): void {
    const data = this.getData();
    data.hygieneRoutines.push(routine);
    this.saveData(data);
    this.regenerateDailySchedule();
  }

  // Meal Plans
  static addMealPlan(meal: MealPlan): void {
    const data = this.getData();
    data.mealPlans.push(meal);
    this.saveData(data);
    this.regenerateDailySchedule();
  }

  // Mental Health
  static addMentalHealthSchedule(schedule: MentalHealthSchedule): void {
    const data = this.getData();
    data.mentalHealthSchedules.push(schedule);
    this.saveData(data);
    this.regenerateDailySchedule();
  }

  // Work Blocks
  static addWorkBlock(block: WorkBlock): void {
    const data = this.getData();
    data.workBlocks.push(block);
    this.saveData(data);
    this.regenerateDailySchedule();
  }

  // Sleep Schedule
  static setSleepSchedule(schedule: SleepSchedule): void {
    const data = this.getData();
    data.sleepSchedule = schedule;
    this.saveData(data);
    this.regenerateDailySchedule();
  }

  // Generate Daily Schedule
  static regenerateDailySchedule(): void {
    const data = this.getData();
    const schedule: DailyScheduleBlock[] = [];
    const today = new Date().getDay();

    // Add sleep/wake up
    if (data.sleepSchedule) {
      schedule.push({
        id: `wake-${Date.now()}`,
        type: 'sleep',
        title: 'Wake Up',
        startTime: data.sleepSchedule.wakeTime,
        endTime: this.addMinutesToTime(data.sleepSchedule.wakeTime, 0),
        isCompleted: false,
        canSkip: false
      });
    }

    // Add morning hygiene
    const morningHygiene = data.hygieneRoutines.find(r => r.type === 'morning');
    if (morningHygiene && morningHygiene.time) {
      schedule.push({
        id: `hygiene-morning-${Date.now()}`,
        type: 'hygiene',
        title: 'Morning Routine',
        startTime: morningHygiene.time,
        endTime: this.addMinutesToTime(morningHygiene.time, morningHygiene.duration),
        description: morningHygiene.activities.join(', '),
        isCompleted: false,
        canSkip: false
      });
    }

    // Add gym
    const gymSchedule = data.gymSchedules.find(g => g.days.includes(today));
    if (gymSchedule) {
      schedule.push({
        id: `gym-${Date.now()}`,
        type: 'gym',
        title: 'Gym Workout',
        startTime: gymSchedule.time,
        endTime: this.addMinutesToTime(gymSchedule.time, gymSchedule.duration),
        description: gymSchedule.workoutType || 'Workout session',
        isCompleted: false,
        canSkip: false
      });
    }

    // Add meals
    data.mealPlans.forEach(meal => {
      schedule.push({
        id: `meal-${meal.mealType}-${Date.now()}`,
        type: 'meal',
        title: meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1),
        startTime: meal.time,
        endTime: this.addMinutesToTime(meal.time, 30),
        description: meal.dietType || '',
        isCompleted: false,
        canSkip: false
      });
    });

    // Add work blocks for today
    data.workBlocks.forEach(block => {
      if (!block.isRecurring || (block.days && block.days.includes(today))) {
        schedule.push({
          id: `work-${block.id}`,
          type: 'work',
          title: block.title,
          startTime: block.startTime,
          endTime: block.endTime,
          description: block.type,
          isCompleted: false,
          canSkip: block.priority === 'low'
        });
      }
    });

    // Add mental health breaks
    data.mentalHealthSchedules.forEach(mental => {
      schedule.push({
        id: `mental-${mental.id}`,
        type: 'break',
        title: mental.type.charAt(0).toUpperCase() + mental.type.slice(1),
        startTime: mental.time,
        endTime: this.addMinutesToTime(mental.time, mental.duration),
        description: mental.activity || '',
        isCompleted: false,
        canSkip: true
      });
    });

    // Sort by time
    schedule.sort((a, b) => {
      const timeA = this.timeToMinutes(a.startTime);
      const timeB = this.timeToMinutes(b.startTime);
      return timeA - timeB;
    });

    data.dailySchedule = schedule;
    this.saveData(data);
  }

  private static timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private static addMinutesToTime(time: string, minutes: number): string {
    const totalMinutes = this.timeToMinutes(time) + minutes;
    const hours = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  static getTodaySchedule(): DailyScheduleBlock[] {
    const data = this.getData();
    return data.dailySchedule;
  }

  static markBlockComplete(id: string): void {
    const data = this.getData();
    const block = data.dailySchedule.find(b => b.id === id);
    if (block) {
      block.isCompleted = true;
      this.saveData(data);
    }
  }
}
