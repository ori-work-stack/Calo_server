export interface Ingredient {
  protein: number;
  carbs: number;
  fat: number;
  cholesterol_mg: number;
  saturated_fats_g: number;
  polyunsaturated_fats_g: number;
  monounsaturated_fats_g: number;
  omega_3_g: number;
  omega_6_g: number;
  soluble_fiber_g: number;
  insoluble_fiber_g: number;
  alcohol_g: number;
  caffeine_mg: number;
  serving_size_g: number;
  glycemic_index: null;
  insulin_index: null;
  vitamins_json: {};
  micronutrients_json: {};
  allergens_json: {};
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
}

export interface MealAnalysisResult {
  recommendations: string;
  // Basic identification
  name: string;
  description?: string;

  // Core macronutrients
  calories: number;
  protein: number;
  carbs: number;
  fat: number;

  // Detailed macronutrients
  saturated_fats_g?: number;
  polyunsaturated_fats_g?: number;
  monounsaturated_fats_g?: number;
  omega_3_g?: number;
  omega_6_g?: number;

  // Carbohydrate details
  fiber?: number;
  soluble_fiber_g?: number;
  insoluble_fiber_g?: number;
  sugar?: number;

  // Other nutrients
  cholesterol_mg?: number;
  sodium?: number;
  alcohol_g?: number;
  caffeine_mg?: number;
  liquids_ml?: number;
  serving_size_g?: number;

  // JSON fields
  allergens_json?: any;
  vitamins_json?: any;
  micronutrients_json?: any;
  additives_json?: any;

  // Indexes and categories
  glycemic_index?: number;
  insulin_index?: number;
  food_category?: string;
  processing_level?: string;
  cooking_method?: string;
  health_risk_notes?: string;

  // Legacy fields for compatibility
  confidence: number;
  ingredients: Ingredient[];
  servingSize: string;
  cookingMethod: string;
  healthNotes: string;
}

export interface MealPlanRequest {
  age: number;
  weight_kg: number;
  height_cm: number;
  target_calories_daily: number;
  target_protein_daily: number;
  target_carbs_daily: number;
  target_fats_daily: number;
  meals_per_day: number;
  snacks_per_day: number;
  rotation_frequency_days: number;
  include_leftovers: boolean;
  fixed_meal_times: boolean;
  dietary_preferences: string[];
  excluded_ingredients: string[];
  allergies: any[];
  physical_activity_level: string;
  sport_frequency: string;
  main_goal: string;
  dietary_preferences_questionnaire: any[];
  avoided_foods: any[];
  meal_texture_preference?: string;
  cooking_skill_level: string;
  available_cooking_time: string;
  kitchen_equipment: string[];
}

export interface ReplacementMealRequest {
  current_meal: {
    name: string;
    meal_timing: string;
    dietary_category: string;
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fats_g?: number;
  };
  user_preferences: {
    dietary_preferences: string[];
    excluded_ingredients: string[];
    allergies: any[];
    preferred_dietary_category?: string;
    max_prep_time?: number;
  };
  nutrition_targets: {
    target_calories: number;
    target_protein: number;
  };
}

export interface MealPlanResponse {
  weekly_plan: {
    day: string;
    day_index: number;
    meals: {
      name: string;
      description: string;
      meal_timing: string;
      dietary_category: string;
      prep_time_minutes: number;
      difficulty_level: number;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fats_g: number;
      fiber_g: number;
      sugar_g: number;
      sodium_mg: number;
      ingredients: {
        name: string;
        quantity: number;
        unit: string;
        category: string;
      }[];
      instructions: {
        step: number;
        text: string;
      }[];
      allergens: string[];
      image_url: string;
      portion_multiplier: number;
      is_optional: boolean;
    }[];
  }[];
  weekly_nutrition_summary: {
    avg_daily_calories: number;
    avg_daily_protein: number;
    avg_daily_carbs: number;
    avg_daily_fats: number;
    goal_adherence_percentage: number;
  };
  shopping_tips: string[];
  meal_prep_suggestions: string[];
}
