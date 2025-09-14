import { prisma } from "../../lib/database";
import { DatabaseOptimizationService } from "./optimization";
import { OpenAIService } from "../openai";
import { DailyRecommendation, AIRecommendationResponse } from "../../types/recommendations";
import { StatisticsService } from "../statistics";
export interface RecommendationCreationResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export class EnhancedAIRecommendationService {
  /**
   * Generate AI recommendations for all eligible users
   */
  static async generateRecommendationsForAllUsers(): Promise<RecommendationCreationResult> {
    console.log("🤖 Starting enhanced AI recommendations generation...");

    const result: RecommendationCreationResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      const today = new Date().toISOString().split('T')[0];

      // Get users who need recommendations with optimized query
      const eligibleUsers = await prisma.user.findMany({
        where: {
          AND: [
            { is_questionnaire_completed: true },
            {
              // Only users without recommendations for today
              aiRecommendations: {
                none: {
                  date: today
                }
              }
            }
          ]
        },
        include: {
          questionnaires: {
            orderBy: { date_completed: 'desc' },
            take: 1
          }
        },
        take: 50 // Limit to prevent overwhelming the system
      });

      console.log(`🎯 Found ${eligibleUsers.length} users needing AI recommendations`);

      if (eligibleUsers.length === 0) {
        console.log("📝 No users need AI recommendations today");
        return result;
      }

      // Process users in smaller batches
      const batchSize = 5;
      for (let i = 0; i < eligibleUsers.length; i += batchSize) {
        const batch = eligibleUsers.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (user) => {
          try {
            // Double-check for duplicates
            const duplicateCheck = await DatabaseOptimizationService.checkForDuplicates(
              user.user_id, 
              today
            );

            if (duplicateCheck.hasRecommendation) {
              result.skipped++;
              console.log(`⏭️ Skipped user ${user.user_id} - recommendation already exists`);
              return;
            }

            // Generate personalized recommendations
            const recommendation = await this.generatePersonalizedRecommendation(
              user.user_id,
              user.questionnaires[0]
            );

            if (recommendation) {
              result.created++;
              console.log(`✅ Generated recommendation for user: ${user.user_id}`);
            }

          } catch (error) {
            result.errors.push(`User ${user.user_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            console.error(`❌ Failed to generate recommendation for user ${user.user_id}:`, error);
          }
        }));

        // Delay between batches to be respectful to API limits
        if (i + batchSize < eligibleUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log(`✅ AI recommendations generation completed:`, result);
      return result;

    } catch (error) {
      console.error("💥 Error in AI recommendations generation:", error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Generate daily recommendations for a specific user
   */
  static async generateDailyRecommendations(
    userId: string
  ): Promise<DailyRecommendation> {
    try {
      console.log("🤖 Generating daily AI recommendations for user:", userId);

      // Get user's recent performance (last 7 days)
      const recentStats = await StatisticsService.getNutritionStatistics(
        userId,
        "week"
      );

      // Get yesterday's performance specifically
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStart = new Date(
        yesterday.getFullYear(),
        yesterday.getMonth(),
        yesterday.getDate()
      );
      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);

      const yesterdayStats = await StatisticsService.getPeriodConsumption(
        userId,
        yesterdayStart,
        yesterdayEnd
      );
      const dailyGoals = await StatisticsService.getUserDailyGoals(userId);

      // Get user preferences and restrictions
      const userProfile = await this.getUserProfile(userId);

      // Generate AI recommendations
      const aiRecommendations = await this.callAIForRecommendations({
        userId,
        recentPerformance: recentStats.data,
        yesterdayConsumption: yesterdayStats,
        dailyGoals,
        userProfile,
      });

      // Save recommendations to database
      const savedRecommendation = await this.saveRecommendation(
        userId,
        aiRecommendations
      );

      console.log("✅ Daily recommendations generated and saved");
      return savedRecommendation;
    } catch (error) {
      console.error("💥 Error generating daily recommendations:", error);

      // Return fallback recommendations if AI fails
      return this.getFallbackRecommendations(userId);
    }
  }

  /**
   * Get user profile for personalized recommendations
   */
  private static async getUserProfile(userId: string): Promise<any> {
    try {
      const user = await prisma.user.findUnique({
        where: { user_id: userId },
        include: {
          questionnaires: {
            orderBy: { date_completed: "desc" },
            take: 1,
          },
        },
      });

      const questionnaire = user?.questionnaires[0];

      return {
        dietary_preferences: questionnaire?.dietary_style
          ? [questionnaire.dietary_style]
          : [],
        health_conditions: questionnaire?.medical_conditions || [],
        main_goal: questionnaire?.main_goal || "WEIGHT_MAINTENANCE",
        activity_level: questionnaire?.physical_activity_level || "MODERATE",
        age: questionnaire?.age || 30,
        weight_kg: questionnaire?.weight_kg || 70,
        allergies: questionnaire?.allergies || [],
        restrictions: questionnaire?.dietary_restrictions || [],
      };
    } catch (error) {
      console.error("Error getting user profile:", error);
      return {
        dietary_preferences: [],
        health_conditions: [],
        main_goal: "WEIGHT_MAINTENANCE",
        activity_level: "MODERATE",
        age: 30,
        weight_kg: 70,
        allergies: [],
        restrictions: [],
      };
    }
  }

  /**
   * Call AI for recommendations generation
   */
  private static async callAIForRecommendations(data: any): Promise<AIRecommendationResponse> {
    try {
      const prompt = `
You are a professional nutritionist AI assistant. Analyze the user's nutrition data and provide personalized daily recommendations.

USER DATA:
- Recent 7-day performance: ${JSON.stringify(data.recentPerformance, null, 2)}
- Yesterday's consumption: ${JSON.stringify(data.yesterdayConsumption, null, 2)}
- Daily goals: ${JSON.stringify(data.dailyGoals, null, 2)}
- User profile: ${JSON.stringify(data.userProfile, null, 2)}

ANALYSIS FOCUS:
1. Goal achievement patterns (under/over consumption)
2. Nutritional gaps or excesses
3. Consistency in eating habits
4. Areas for improvement

Provide recommendations in this JSON format:
{
  "nutrition_tips": ["tip1", "tip2", "tip3"],
  "meal_suggestions": ["suggestion1", "suggestion2"],
  "goal_adjustments": ["adjustment1", "adjustment2"],
  "behavioral_insights": ["insight1", "insight2"],
  "priority_level": "low|medium|high",
  "confidence_score": 0.85,
  "key_focus_areas": ["area1", "area2"]
}

Be specific, actionable, and encouraging. Focus on realistic improvements.
`;

      const response = await OpenAIService.generateText(prompt, 1500);
      return JSON.parse(response);
    } catch (error) {
      console.error("AI recommendation generation failed:", error);
      throw error;
    }
  }

  /**
   * Get fallback recommendations when AI fails
   */
  private static async getFallbackRecommendations(userId: string): Promise<DailyRecommendation> {
    console.log("🆘 Using fallback recommendations");

    const fallbackRecommendations: AIRecommendationResponse = {
      nutrition_tips: [
        "Stay hydrated by drinking 8-10 glasses of water daily",
        "Include a variety of colorful vegetables in your meals",
        "Aim for lean protein sources like chicken, fish, or legumes",
      ],
      meal_suggestions: [
        "Start your day with a protein-rich breakfast",
        "Include fiber-rich foods to help you feel full longer",
      ],
      goal_adjustments: [
        "Track your meals consistently for better insights",
        "Focus on portion control for better goal achievement",
      ],
      behavioral_insights: [
        "Consistency in meal timing can improve your results",
        "Planning meals ahead helps maintain nutritional balance",
      ],
      priority_level: "medium",
      confidence_score: 0.6,
      key_focus_areas: ["hydration", "consistency"],
    };

    return this.saveRecommendation(userId, fallbackRecommendations);
  }

  /**
   * Generate personalized recommendation for a specific user
   */
  private static async generatePersonalizedRecommendation(
    userId: string,
    questionnaire: any
  ): Promise<DailyRecommendation | null> {
    try {
      console.log("🎯 Generating personalized recommendation for user:", userId);

      // Get user's recent performance data
      const recentData = await this.getUserRecentPerformance(userId);
      
      // Generate AI recommendations
      const aiRecommendations = await this.generateAIRecommendations(
        userId,
        questionnaire,
        recentData
      );

      // Save to database
      const savedRecommendation = await this.saveRecommendation(
        userId,
        aiRecommendations
      );

      return savedRecommendation;

    } catch (error) {
      console.error("Error generating personalized recommendation:", error);
      
      // Create fallback recommendation
      return await this.createFallbackRecommendation(userId);
    }
  }

  /**
   * Get user's recent performance for analysis
   */
  private static async getUserRecentPerformance(userId: string) {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [recentMeals, recentWaterIntake, recentGoals] = await Promise.all([
        prisma.meal.findMany({
          where: {
            user_id: userId,
            created_at: { gte: sevenDaysAgo }
          },
          select: {
            calories: true,
            protein_g: true,
            carbs_g: true,
            fats_g: true,
            created_at: true
          }
        }),
        prisma.waterIntake.findMany({
          where: {
            user_id: userId,
            date: { gte: sevenDaysAgo }
          },
          select: {
            cups_consumed: true,
            date: true
          }
        }),
        prisma.dailyGoal.findMany({
          where: {
            user_id: userId,
            date: { gte: sevenDaysAgo }
          },
          select: {
            calories: true,
            protein_g: true,
            water_ml: true,
            date: true
          }
        })
      ]);

      // Calculate performance metrics
      const totalCalories = recentMeals.reduce((sum, meal) => sum + (meal.calories || 0), 0);
      const totalProtein = recentMeals.reduce((sum, meal) => sum + (meal.protein_g || 0), 0);
      const avgWaterIntake = recentWaterIntake.reduce((sum, water) => sum + (water.cups_consumed || 0), 0) / Math.max(recentWaterIntake.length, 1);
      
      const goalAchievementRate = this.calculateGoalAchievementRate(recentMeals, recentGoals);

      return {
        totalCalories,
        totalProtein,
        avgWaterIntake,
        goalAchievementRate,
        mealFrequency: recentMeals.length / 7,
        consistencyScore: this.calculateConsistencyScore(recentMeals)
      };

    } catch (error) {
      console.error("Error getting user recent performance:", error);
      return {
        totalCalories: 0,
        totalProtein: 0,
        avgWaterIntake: 0,
        goalAchievementRate: 0,
        mealFrequency: 0,
        consistencyScore: 0
      };
    }
  }

  /**
   * Generate AI-powered recommendations
   */
  private static async generateAIRecommendations(
    userId: string,
    questionnaire: any,
    recentData: any
  ): Promise<AIRecommendationResponse> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.log("⚠️ No OpenAI key, using intelligent fallback");
        return this.generateIntelligentFallbackRecommendations(questionnaire, recentData);
      }

      const prompt = this.buildRecommendationPrompt(questionnaire, recentData);
      const aiResponse = await OpenAIService.generateText(prompt, 1000);

      // Parse AI response
      const parsed = JSON.parse(aiResponse);
      return this.validateAndNormalizeRecommendations(parsed);

    } catch (error) {
      console.error("AI recommendation generation failed:", error);
      return this.generateIntelligentFallbackRecommendations(questionnaire, recentData);
    }
  }

  /**
   * Build comprehensive prompt for AI recommendations
   */
  private static buildRecommendationPrompt(questionnaire: any, recentData: any): string {
    return `Analyze this user's nutrition data and provide personalized daily recommendations.

USER PROFILE:
- Age: ${questionnaire?.age || 'Unknown'}
- Goal: ${questionnaire?.main_goal || 'GENERAL_HEALTH'}
- Activity Level: ${questionnaire?.physical_activity_level || 'MODERATE'}
- Dietary Style: ${questionnaire?.dietary_style || 'Regular'}
- Allergies: ${questionnaire?.allergies?.join(', ') || 'None'}
- Weight: ${questionnaire?.weight_kg || 'Unknown'}kg

RECENT PERFORMANCE (Last 7 days):
- Total Calories: ${recentData.totalCalories}
- Total Protein: ${recentData.totalProtein}g
- Average Water Intake: ${recentData.avgWaterIntake} cups/day
- Goal Achievement Rate: ${Math.round(recentData.goalAchievementRate * 100)}%
- Meal Frequency: ${recentData.mealFrequency} meals/day
- Consistency Score: ${Math.round(recentData.consistencyScore * 100)}%

ANALYSIS FOCUS:
1. Identify nutritional gaps or excesses
2. Assess goal achievement patterns
3. Evaluate eating consistency
4. Consider user's specific health goals

Provide recommendations in this JSON format:
{
  "nutrition_tips": ["tip1", "tip2", "tip3"],
  "meal_suggestions": ["suggestion1", "suggestion2"],
  "goal_adjustments": ["adjustment1", "adjustment2"],
  "behavioral_insights": ["insight1", "insight2"],
  "priority_level": "low|medium|high",
  "confidence_score": 0.85,
  "key_focus_areas": ["area1", "area2"]
}

Be specific, actionable, and encouraging. Consider the user's allergies and dietary restrictions.`;
  }

  /**
   * Generate intelligent fallback recommendations
   */
  private static generateIntelligentFallbackRecommendations(
    questionnaire: any,
    recentData: any
  ): AIRecommendationResponse {
    const recommendations: AIRecommendationResponse = {
      nutrition_tips: [],
      meal_suggestions: [],
      goal_adjustments: [],
      behavioral_insights: [],
      priority_level: 'medium',
      confidence_score: 0.7,
      key_focus_areas: []
    };

    // Analyze recent performance and generate targeted recommendations
    if (recentData.avgWaterIntake < 6) {
      recommendations.nutrition_tips.push("Increase water intake to 8-10 cups daily for better hydration");
      recommendations.key_focus_areas.push("hydration");
    }

    if (recentData.goalAchievementRate < 0.5) {
      recommendations.goal_adjustments.push("Consider adjusting daily calorie goals to be more achievable");
      recommendations.priority_level = 'high';
    }

    if (recentData.mealFrequency < 2) {
      recommendations.behavioral_insights.push("Try to maintain at least 3 meals per day for better nutrition distribution");
    }

    // Goal-specific recommendations
    if (questionnaire?.main_goal === 'WEIGHT_LOSS') {
      recommendations.meal_suggestions.push("Focus on high-protein, low-calorie meals with plenty of vegetables");
      recommendations.nutrition_tips.push("Aim for a moderate calorie deficit while maintaining protein intake");
    } else if (questionnaire?.main_goal === 'WEIGHT_GAIN') {
      recommendations.meal_suggestions.push("Include calorie-dense, nutritious foods like nuts, avocados, and lean proteins");
      recommendations.nutrition_tips.push("Add healthy snacks between meals to increase daily calorie intake");
    }

    // Activity-based recommendations
    if (questionnaire?.physical_activity_level === 'HIGH') {
      recommendations.nutrition_tips.push("Increase protein intake to support muscle recovery and growth");
      recommendations.meal_suggestions.push("Include post-workout meals with carbs and protein within 2 hours of exercise");
    }

    // Dietary style recommendations
    if (questionnaire?.dietary_style?.toLowerCase().includes('vegetarian')) {
      recommendations.nutrition_tips.push("Ensure adequate B12, iron, and complete protein sources in your diet");
    }

    // Default recommendations if none generated
    if (recommendations.nutrition_tips.length === 0) {
      recommendations.nutrition_tips = [
        "Maintain a balanced diet with variety in food choices",
        "Stay consistent with meal timing for better metabolism",
        "Include colorful vegetables and fruits in your daily meals"
      ];
    }

    if (recommendations.meal_suggestions.length === 0) {
      recommendations.meal_suggestions = [
        "Start your day with a protein-rich breakfast",
        "Include fiber-rich foods to help you feel satisfied longer"
      ];
    }

    return recommendations;
  }

  /**
   * Save recommendation to database
   */
  private static async saveRecommendation(
    userId: string,
    recommendations: AIRecommendationResponse
  ): Promise<DailyRecommendation> {
    try {
      const today = new Date().toISOString().split('T')[0];

      const saved = await prisma.aiRecommendation.create({
        data: {
          user_id: userId,
          date: today,
          recommendations: recommendations,
          priority_level: recommendations.priority_level,
          confidence_score: recommendations.confidence_score,
          based_on: {
            recent_performance: "7_day_analysis",
            goal_achievement: "daily_tracking",
            nutritional_gaps: "macro_micro_analysis"
          },
          is_read: false
        }
      });

      return {
        id: saved.id,
        user_id: saved.user_id,
        date: saved.date,
        recommendations: saved.recommendations as any,
        priority_level: saved.priority_level as 'low' | 'medium' | 'high',
        confidence_score: saved.confidence_score,
        based_on: saved.based_on as any,
        created_at: saved.created_at,
        is_read: saved.is_read
      };

    } catch (error) {
      console.error("Error saving recommendation:", error);
      throw error;
    }
  }

  /**
   * Create fallback recommendation when AI fails
   */
  private static async createFallbackRecommendation(userId: string): Promise<DailyRecommendation | null> {
    try {
      const questionnaire = await prisma.userQuestionnaire.findFirst({
        where: { user_id: userId },
        orderBy: { date_completed: 'desc' }
      });

      const fallbackRecommendations = this.generateIntelligentFallbackRecommendations(
        questionnaire,
        { totalCalories: 0, totalProtein: 0, avgWaterIntake: 0, goalAchievementRate: 0, mealFrequency: 0, consistencyScore: 0 }
      );

      return await this.saveRecommendation(userId, fallbackRecommendations);

    } catch (error) {
      console.error("Error creating fallback recommendation:", error);
      return null;
    }
  }

  /**
   * Calculate goal achievement rate
   */
  private static calculateGoalAchievementRate(meals: any[], goals: any[]): number {
    if (goals.length === 0) return 0;

    // Group meals by date
    const mealsByDate = new Map<string, any[]>();
    meals.forEach(meal => {
      const date = meal.created_at.toISOString().split('T')[0];
      if (!mealsByDate.has(date)) {
        mealsByDate.set(date, []);
      }
      mealsByDate.get(date)!.push(meal);
    });

    let achievedDays = 0;
    goals.forEach(goal => {
      const date = goal.date.toISOString().split('T')[0];
      const dayMeals = mealsByDate.get(date) || [];
      const dayCalories = dayMeals.reduce((sum, meal) => sum + (meal.calories || 0), 0);
      
      if (dayCalories >= (goal.calories * 0.8)) { // 80% of goal considered achieved
        achievedDays++;
      }
    });

    return achievedDays / goals.length;
  }

  /**
   * Calculate consistency score based on meal timing patterns
   */
  private static calculateConsistencyScore(meals: any[]): number {
    if (meals.length < 3) return 0;

    // Group meals by date and calculate daily consistency
    const mealsByDate = new Map<string, any[]>();
    meals.forEach(meal => {
      const date = meal.created_at.toISOString().split('T')[0];
      if (!mealsByDate.has(date)) {
        mealsByDate.set(date, []);
      }
      mealsByDate.get(date)!.push(meal);
    });

    let consistentDays = 0;
    mealsByDate.forEach(dayMeals => {
      if (dayMeals.length >= 2) { // At least 2 meals per day
        consistentDays++;
      }
    });

    return consistentDays / mealsByDate.size;
  }

  /**
   * Validate and normalize AI recommendations
   */
  private static validateAndNormalizeRecommendations(parsed: any): AIRecommendationResponse {
    return {
      nutrition_tips: Array.isArray(parsed.nutrition_tips) ? parsed.nutrition_tips : [],
      meal_suggestions: Array.isArray(parsed.meal_suggestions) ? parsed.meal_suggestions : [],
      goal_adjustments: Array.isArray(parsed.goal_adjustments) ? parsed.goal_adjustments : [],
      behavioral_insights: Array.isArray(parsed.behavioral_insights) ? parsed.behavioral_insights : [],
      priority_level: ['low', 'medium', 'high'].includes(parsed.priority_level) ? parsed.priority_level : 'medium',
      confidence_score: typeof parsed.confidence_score === 'number' ? parsed.confidence_score : 0.7,
      key_focus_areas: Array.isArray(parsed.key_focus_areas) ? parsed.key_focus_areas : []
    };
  }

  /**
   * Get user recommendations with pagination
   */
  static async getUserRecommendations(
    userId: string,
    limit: number = 7
  ): Promise<DailyRecommendation[]> {
    try {
      const recommendations = await prisma.aiRecommendation.findMany({
        where: { user_id: userId },
        orderBy: { date: 'desc' },
        take: limit
      });

      return recommendations.map(rec => ({
        id: rec.id,
        user_id: rec.user_id,
        date: rec.date,
        recommendations: rec.recommendations as any,
        priority_level: rec.priority_level as 'low' | 'medium' | 'high',
        confidence_score: rec.confidence_score,
        based_on: rec.based_on as any,
        created_at: rec.created_at,
        is_read: rec.is_read
      }));

    } catch (error) {
      console.error("Error getting user recommendations:", error);
      return [];
    }
  }
}