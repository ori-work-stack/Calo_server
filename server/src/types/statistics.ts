import { NutritionGoals } from "../services/statistics";

export interface NutritionStatistics {
  average_calories_daily: number;
  calorie_goal_achievement_percent: number;
  average_protein_daily: number;
  average_carbs_daily: number;
  average_fats_daily: number;
  average_fiber_daily: number;
  average_sodium_daily: number;
  average_sugar_daily: number;
  average_fluids_daily: number;
  processed_food_percentage: number;
  alcohol_caffeine_intake: number;
  vegetable_fruit_intake: number;
  full_logging_percentage: number;
  allergen_alerts: string[];
  health_risk_percentage: number;
  average_eating_hours: { start: string; end: string };
  intermittent_fasting_hours: number;
  missed_meals_alert: number;
  nutrition_score: number;
  weekly_trends: {
    calories: number[];
    protein: number[];
    carbs: number[];
    fats: number[];
  };
  insights: string[];
  recommendations: string[];
  currentStreak?: number;
  bestStreak?: number;
  dailyBreakdown?: DailyBreakdown[];
  moodStats?: { happy: number; neutral: number; sad: number };
  energyStats?: { high: number; medium: number; low: number };
  mealQualityStats?: { average: number; distribution: number[] };
  totalPoints?: number;
  level?: number;
  currentXP?: number;
  proteinGoalDays?: number;
  hydrationGoalDays?: number;
  balancedMealDays?: number;
  fiberGoalDays?: number;
  perfectDays?: number;
  weeklyStreak?: number;
  previous_calories_daily?: number;
  previous_protein_daily?: number;
  previous_carbs_daily?: number;
  previous_fats_daily?: number;
  previous_fiber_daily?: number;
  previous_sodium_daily?: number;
  previous_sugar_daily?: number;
  previous_fluids_daily?: number;
}

export interface DailyBreakdown {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  liquids_ml: number;
  weight_kg?: number;
  mood?: string;
  energy?: string;
  satiety?: string;
  meal_quality?: number;
}

export interface StatisticsData {
  level: number;
  currentXP: number;
  totalPoints: number;
  currentStreak: number;
  bestStreak: number;
  weeklyStreak: number;
  perfectDays: number;
  dailyGoalDays: number;
  totalDays: number;
  averageCalories: number;
  averageProtein: number;
  averageCarbs: number;
  averageFats: number;
  averageFiber: number;
  averageSugar: number;
  averageSodium: number;
  averageFluids: number;
  achievements: any[];
  dailyBreakdown: any[];
  successfulDays: number;
  averageCompletion: number;
  happyDays: number;
  highEnergyDays: number;
  satisfiedDays: number;
  averageMealQuality: number;
}

interface PeriodStatistics {
  period_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  goals: NutritionGoals;
  consumption: NutritionGoals;
  progress_percentages: NutritionGoals;
  daily_averages: NutritionGoals;
  meal_count: number;
  completion_rate: number;
  currentStreak?: number;
  bestStreak?: number;
  weeklyStreak?: number;
  perfectDays?: number;
  successfulDays?: number;
  averageCompletion?: number;
  happyDays?: number;
  highEnergyDays?: number;
  satisfiedDays?: number;
  averageMealQuality?: number;
  averageFluids?: number;
  averageCalories?: number;
  averageProtein?: number;
  averageCarbs?: number;
  averageFats?: number;
  averageFiber?: number;
  averageSugar?: number;
  averageSodium?: number;
}