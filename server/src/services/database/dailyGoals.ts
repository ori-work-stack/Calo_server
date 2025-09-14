import { prisma } from "../../lib/database";
import { DatabaseOptimizationService } from "./optimization";
import { NutritionGoals } from "../../types/statistics";

export interface DailyGoalCreationResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export class EnhancedDailyGoalsService {
  /**
   * Create daily goals for all eligible users with duplicate prevention
   */
  static async createDailyGoalsForAllUsers(): Promise<DailyGoalCreationResult> {
    console.log("📊 Starting enhanced daily goals creation...");

    const result: DailyGoalCreationResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      // Check database health first
      const health = await DatabaseOptimizationService.checkDatabaseHealth();
      if (health.status === 'critical') {
        console.log("🚨 Database in critical state, performing cleanup...");
        await DatabaseOptimizationService.performIntelligentCleanup();
      }

      const today = new Date();
      const todayString = today.toISOString().split('T')[0];

      // Get eligible users with optimized query
      const eligibleUsers = await prisma.user.findMany({
        where: {
          // Only get users who don't have goals for today
          dailyGoals: {
            none: {
              date: new Date(todayString)
            }
          }
        },
        include: {
          questionnaires: {
            orderBy: { date_completed: 'desc' },
            take: 1
          }
        }
      });

      console.log(`📊 Found ${eligibleUsers.length} users needing daily goals`);

      // Process users in batches to avoid overwhelming the database
      const batchSize = 10;
      for (let i = 0; i < eligibleUsers.length; i += batchSize) {
        const batch = eligibleUsers.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (user) => {
          try {
            // Double-check for duplicates before creating
            const duplicateCheck = await DatabaseOptimizationService.checkForDuplicates(
              user.user_id, 
              todayString
            );

            if (duplicateCheck.hasDailyGoal) {
              result.skipped++;
              console.log(`⏭️ Skipped user ${user.user_id} - goal already exists`);
              return;
            }

            // Check if user should get goals based on subscription
            const shouldCreate = await this.shouldCreateGoalsForUser(user, today);
            if (!shouldCreate) {
              result.skipped++;
              return;
            }

            // Calculate personalized goals
            const goals = this.calculatePersonalizedGoals(user.questionnaires[0]);

            // Create goals with upsert for safety
            await prisma.dailyGoal.upsert({
              where: {
                user_id_date: {
                  user_id: user.user_id,
                  date: new Date(todayString)
                }
              },
              update: {
                ...goals,
                updated_at: new Date()
              },
              create: {
                user_id: user.user_id,
                date: new Date(todayString),
                ...goals
              }
            });

            result.created++;
            console.log(`✅ Created daily goals for user: ${user.user_id}`);

          } catch (error) {
            result.errors.push(`User ${user.user_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            console.error(`❌ Failed to create goals for user ${user.user_id}:`, error);
          }
        }));

        // Small delay between batches
        if (i + batchSize < eligibleUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`📊 Daily goals creation completed:`, result);
      return result;

    } catch (error) {
      console.error("💥 Error in daily goals creation:", error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Determine if user should receive daily goals
   */
  private static async shouldCreateGoalsForUser(user: any, today: Date): Promise<boolean> {
    // Premium users get daily goals every day
    if (user.subscription_type === 'PREMIUM' || user.subscription_type === 'GOLD') {
      return true;
    }

    // Free users get goals based on signup day of week
    const signupDate = new Date(user.signup_date);
    const signupDayOfWeek = signupDate.getDay();
    const todayDayOfWeek = today.getDay();

    return todayDayOfWeek === signupDayOfWeek;
  }

  /**
   * Calculate personalized daily goals based on questionnaire
   */
  private static calculatePersonalizedGoals(questionnaire: any): NutritionGoals {
    // Default values
    let baseCalories = 2000;
    let baseProtein = 120;
    let baseCarbs = 250;
    let baseFats = 70;
    let baseWaterMl = 2500;

    if (questionnaire) {
      // Calculate BMR using Mifflin-St Jeor equation (more accurate)
      const weight = questionnaire.weight_kg || 70;
      const height = questionnaire.height_cm || 170;
      const age = questionnaire.age || 25;
      const isMale = questionnaire.gender?.toLowerCase().includes('male') || 
                     questionnaire.gender?.toLowerCase().includes('זכר');

      let bmr;
      if (isMale) {
        bmr = 10 * weight + 6.25 * height - 5 * age + 5;
      } else {
        bmr = 10 * weight + 6.25 * height - 5 * age - 161;
      }

      // Activity level multipliers
      const activityMultipliers = {
        'NONE': 1.2,
        'LIGHT': 1.375,
        'MODERATE': 1.55,
        'HIGH': 1.725
      };

      const activityLevel = questionnaire.physical_activity_level || 'MODERATE';
      const tdee = bmr * (activityMultipliers[activityLevel] || 1.55);

      // Adjust based on goal
      switch (questionnaire.main_goal) {
        case 'WEIGHT_LOSS':
          baseCalories = Math.round(tdee - 500); // 500 calorie deficit
          break;
        case 'WEIGHT_GAIN':
          baseCalories = Math.round(tdee + 300); // 300 calorie surplus
          break;
        case 'SPORTS_PERFORMANCE':
          baseCalories = Math.round(tdee + 200); // Slight surplus for performance
          break;
        default:
          baseCalories = Math.round(tdee);
      }

      // Calculate macros based on goal and preferences
      if (questionnaire.main_goal === 'SPORTS_PERFORMANCE') {
        baseProtein = Math.round(weight * 2.0); // Higher protein for athletes
        baseCarbs = Math.round((baseCalories * 0.55) / 4); // 55% carbs for performance
        baseFats = Math.round((baseCalories * 0.25) / 9); // 25% fats
      } else if (questionnaire.dietary_style?.toLowerCase().includes('keto')) {
        baseProtein = Math.round(weight * 1.6);
        baseCarbs = Math.round((baseCalories * 0.05) / 4); // 5% carbs for keto
        baseFats = Math.round((baseCalories * 0.75) / 9); // 75% fats
      } else {
        baseProtein = Math.round(weight * 1.6); // Standard protein
        baseCarbs = Math.round((baseCalories * 0.45) / 4); // 45% carbs
        baseFats = Math.round((baseCalories * 0.30) / 9); // 30% fats
      }

      // Water based on weight and activity
      baseWaterMl = Math.round(weight * 35);
      if (activityLevel === 'HIGH') {
        baseWaterMl += 500; // Extra water for high activity
      }
    }

    return {
      calories: Math.max(1200, baseCalories), // Minimum 1200 calories
      protein_g: baseProtein,
      carbs_g: baseCarbs,
      fats_g: baseFats,
      fiber_g: 25,
      water_ml: baseWaterMl,
      sodium_mg: 2300,
      sugar_g: Math.round(baseCalories * 0.1 / 4) // 10% of calories from sugar max
    };
  }

  /**
   * Get user's current daily goals with caching
   */
  static async getUserDailyGoals(userId: string): Promise<NutritionGoals> {
    try {
      // Try to get today's goals first
      const today = new Date().toISOString().split('T')[0];
      const todayGoals = await prisma.dailyGoal.findFirst({
        where: {
          user_id: userId,
          date: new Date(today)
        }
      });

      if (todayGoals) {
        return {
          calories: Number(todayGoals.calories) || 2000,
          protein_g: Number(todayGoals.protein_g) || 150,
          carbs_g: Number(todayGoals.carbs_g) || 250,
          fats_g: Number(todayGoals.fats_g) || 67,
          fiber_g: Number(todayGoals.fiber_g) || 25,
          sodium_mg: Number(todayGoals.sodium_mg) || 2300,
          sugar_g: Number(todayGoals.sugar_g) || 50,
          water_ml: Number(todayGoals.water_ml) || 2500
        };
      }

      // If no goals for today, create them
      console.log("📊 No goals found for today, creating new ones...");
      const newGoals = await this.createDailyGoalsForUser(userId);
      return newGoals;

    } catch (error) {
      console.error("Error getting user daily goals:", error);
      // Return safe defaults
      return {
        calories: 2000,
        protein_g: 150,
        carbs_g: 250,
        fats_g: 67,
        fiber_g: 25,
        sodium_mg: 2300,
        sugar_g: 50,
        water_ml: 2500
      };
    }
  }

  /**
   * Create daily goals for a specific user
   */
  private static async createDailyGoalsForUser(userId: string): Promise<any> {
    try {
      const user = await prisma.user.findUnique({
        where: { user_id: userId },
        include: {
          questionnaires: {
            orderBy: { date_completed: 'desc' },
            take: 1
          }
        }
      });

      if (!user) {
        throw new Error("User not found");
      }

      const goals = this.calculatePersonalizedGoals(user.questionnaires[0]);
      const today = new Date().toISOString().split('T')[0];

      const createdGoals = await prisma.dailyGoal.create({
        data: {
          user_id: userId,
          date: new Date(today),
          ...goals
        }
      });

      console.log(`✅ Created daily goals for user: ${userId}`);
      return createdGoals;

    } catch (error) {
      console.error(`Error creating daily goals for user ${userId}:`, error);
      throw error;
    }
  }
}