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

            // For now, create goals for all users to ensure they have daily goals
            // TODO: Implement subscription-based logic later
            console.log(`📊 Creating goals for user ${user.user_id} (${isPremium ? "Premium" : "Free"})`);

            // Calculate personalized goals
            const goals = this.calculatePersonalizedGoals(user.questionnaires[0]);

            // Create goals with upsert for safety
            const createdGoal = await prisma.dailyGoal.upsert({
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
            console.log(`✅ Created daily goals for user: ${user.user_id}`, {
              calories: createdGoal.calories,
              protein_g: createdGoal.protein_g,
              date: createdGoal.date
            });

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
    let calories = 2000;
    let protein_g = 120;
    let carbs_g = 250;
    let fats_g = 70;
    let water_ml = 2500;
    let fiber_g = 25;
    let sodium_mg = 2300;
    let sugar_g = 50;

    console.log("🧮 Calculating goals with questionnaire:", !!questionnaire);

    if (questionnaire) {
      console.log("📋 Using questionnaire data:", {
        age: questionnaire.age,
        weight: questionnaire.weight_kg,
        height: questionnaire.height_cm,
        goal: questionnaire.main_goal,
        activity: questionnaire.physical_activity_level
      });

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

      console.log("🔢 BMR calculation:", { bmr: Math.round(bmr), tdee: Math.round(tdee) });

      // Adjust based on goal
      switch (questionnaire.main_goal) {
        case 'WEIGHT_LOSS':
          calories = Math.round(tdee - 500); // 500 calorie deficit
          break;
        case 'WEIGHT_GAIN':
          calories = Math.round(tdee + 300); // 300 calorie surplus
          break;
        case 'SPORTS_PERFORMANCE':
          calories = Math.round(tdee + 200); // Slight surplus for performance
          break;
        default:
          calories = Math.round(tdee);
      }

      // Calculate macros based on goal and preferences
      if (questionnaire.main_goal === 'SPORTS_PERFORMANCE') {
        protein_g = Math.round(weight * 2.0); // Higher protein for athletes
        carbs_g = Math.round((calories * 0.55) / 4); // 55% carbs for performance
        fats_g = Math.round((calories * 0.25) / 9); // 25% fats
      } else if (questionnaire.dietary_style?.toLowerCase().includes('keto')) {
        protein_g = Math.round(weight * 1.6);
        carbs_g = Math.round((calories * 0.05) / 4); // 5% carbs for keto
        fats_g = Math.round((calories * 0.75) / 9); // 75% fats
      } else {
        protein_g = Math.round(weight * 1.6); // Standard protein
        carbs_g = Math.round((calories * 0.45) / 4); // 45% carbs
        fats_g = Math.round((calories * 0.30) / 9); // 30% fats
      }

      // Water based on weight and activity
      water_ml = Math.round(weight * 35);
      if (activityLevel === 'HIGH') {
        water_ml += 500; // Extra water for high activity
      }

      // Adjust fiber based on calorie intake
      fiber_g = Math.round(calories / 80); // Roughly 1g fiber per 80 calories
      
      // Adjust sugar limit based on calories
      sugar_g = Math.round(calories * 0.1 / 4); // 10% of calories from sugar max
    }

    const finalGoals = {
      calories: Math.max(1200, calories), // Minimum 1200 calories
      protein_g,
      carbs_g,
      fats_g,
      fiber_g,
      water_ml,
      sodium_mg,
      sugar_g
    };

    console.log("🎯 Final calculated goals:", finalGoals);
    return finalGoals;
  }

  /**
   * Force create daily goals for a specific user (for testing/debugging)
   */
  static async forceCreateDailyGoalsForUser(userId: string): Promise<NutritionGoals> {
    try {
      console.log(`🔄 Force creating daily goals for user: ${userId}`);

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
      const todayDate = new Date(today);

      const createdGoals = await prisma.dailyGoal.upsert({
        where: {
          user_id_date: {
            user_id: userId,
            date: todayDate
          }
        },
        update: {
          ...goals,
          updated_at: new Date()
        },
        create: {
          user_id: userId,
          date: todayDate,
          ...goals
        }
      });

      console.log(`✅ Force created daily goals for user: ${userId}`, createdGoals);

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
      return await this.createDailyGoalsForUser(userId);

    } catch (error) {
      console.error("Error getting user daily goals:", error);
      // Return safe defaults
      return {
        calories: Number(createdGoals.calories),
        protein_g: Number(createdGoals.protein_g),
        carbs_g: Number(createdGoals.carbs_g),
        fats_g: Number(createdGoals.fats_g),
        fiber_g: Number(createdGoals.fiber_g),
        sodium_mg: Number(createdGoals.sodium_mg),
        sugar_g: Number(createdGoals.sugar_g),
        water_ml: Number(createdGoals.water_ml)
      };

    } catch (error) {
      console.error(`Error force creating daily goals for user ${userId}:`, error);
      throw error;
    }
    }
  }

  /**
   * Create daily goals for a specific user
   */
  private static async createDailyGoalsForUser(userId: string): Promise<NutritionGoals> {
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
      return {
        calories: Number(createdGoals.calories),
        protein_g: Number(createdGoals.protein_g),
        carbs_g: Number(createdGoals.carbs_g),
        fats_g: Number(createdGoals.fats_g),
        fiber_g: Number(createdGoals.fiber_g),
        sodium_mg: Number(createdGoals.sodium_mg),
        sugar_g: Number(createdGoals.sugar_g),
        water_ml: Number(createdGoals.water_ml)
      };

    } catch (error) {
      console.error(`Error creating daily goals for user ${userId}:`, error);
      throw error;
    }
  }
}