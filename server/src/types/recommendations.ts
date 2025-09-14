// AI Recommendations types
export interface DailyRecommendation {
  id: string;
  user_id: string;
  date: string;
  recommendations: {
    nutrition_tips: string[];
    meal_suggestions: string[];
    goal_adjustments: string[];
    behavioral_insights: string[];
  };
  priority_level: 'low' | 'medium' | 'high';
  confidence_score: number;
  based_on: {
    recent_performance: any;
    goal_achievement: any;
    nutritional_gaps: any;
  };
  created_at: Date;
  is_read: boolean;
}

export interface RecommendationGenerationParams {
  userId: string;
  recentPerformance: any;
  yesterdayConsumption: any;
  dailyGoals: any;
  userProfile: any;
}

export interface AIRecommendationResponse {
  nutrition_tips: string[];
  meal_suggestions: string[];
  goal_adjustments: string[];
  behavioral_insights: string[];
  priority_level: 'low' | 'medium' | 'high';
  confidence_score: number;
  key_focus_areas: string[];
}

export interface UserProfile {
  dietary_preferences: string[];
  health_conditions: string[];
  main_goal: string;
  activity_level: string;
  age: number;
  weight_kg: number;
  allergies: string[];
  restrictions: string[];
}