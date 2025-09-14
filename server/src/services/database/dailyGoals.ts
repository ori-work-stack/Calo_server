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
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      const todayDate = new Date(todayString);

      console.log("📅 Creating goals for date:", todayString);

      // First, get ALL users to see what we're working with
      const allUsers = await prisma.user.findMany({
        select: {
          user_id: true,
          email: true,
          subscription_type: true,
          is_questionnaire_completed: true,
          created_at: true
        }
      });

      console.log(`👥 Total users in database: ${allUsers.length}`);

      if (allUsers.length === 0) {
        console.log("❌ No users found in database");
        return result;
      }

      // Check which users already have goals for today
      const existingGoals = await prisma.dailyGoal.findMany({
        where: {
          date: todayDate
        },
        select: {
          user_id: true
        }
      });

      const usersWithGoals = new Set(existingGoals.map(goal => goal.user_id));
      console.log(`📊 Users with existing goals for today: ${usersWithGoals.size}`);

      // Filter users who need goals
      const usersNeedingGoals = allUsers.filter(user => !usersWithGoals.has(user.user_id));
      console.log(`🎯 Users needing daily goals: ${usersNeedingGoals.length}`);

      if (usersNeedingGoals.length === 0) {
        console.log("✅ All users already have daily goals for today");
        result.skipped = allUsers.length;
        return result;
      }

      // Get questionnaires for users needing goals
      const userIds = usersNeedingGoals.map(u => u.user_id);
      const questionnaires = await prisma.userQuestionnaire.findMany({
        where: {
          user_id: {
            in: userIds
          }
        },
        orderBy: {
          date_completed: 'desc'
        }
      });

      // Group questionnaires by user_id
      const questionnaireMap = new Map();
      questionnaires.forEach(q => {
        if (!questionnaireMap.has(q.user_id)) {
          questionnaireMap.set(q.user_id, q);
        }
      });

      console.log(`📋 Found questionnaires for ${questionnaireMap.size} users`);

      // Process each user
      for (const user of usersNeedingGoals) {
        try {
          console.log(`📊 Processing user: ${user.user_id} (${user.email})`);

          const questionnaire = questionnaireMap.get(user.user_id);
          const goals = this.calculatePersonalizedGoals(questionnaire);

          console.log(`🎯 Calculated goals for ${user.user_id}:`, {
            calories: goals.calories,
            protein_g: goals.protein_g,
            water_ml: goals.water_ml
          });

          // Create daily goal
          const createdGoal = await prisma.dailyGoal.create({
            data: {
              user_id: user.user_id,
              date: todayDate,
              calories: goals.calories,
              protein_g: goals.protein_g,
              carbs_g: goals.carbs_g,
              fats_g: goals.fats_g,
              fiber_g: goals.fiber_g,
              sodium_mg: goals.sodium_mg,
              sugar_g: goals.sugar_g,
              water_ml: goals.water_ml,
            }
          });

          result.created++;
          console.log(`✅ Created daily goal for user: ${user.user_id}`, {
            id: createdGoal.id,
            calories: createdGoal.calories,
            date: createdGoal.date
          });

        } catch (userError) {
          result.errors.push(`User ${user.user_id}: ${userError instanceof Error ? userError.message : 'Unknown error'}`);
          console.error(`❌ Failed to create goal for user ${user.user_id}:`, userError);
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

      console.log(`👤 Found user: ${user.email}, questionnaires: ${user.questionnaires.length}`);

      const goals = this.calculatePersonalizedGoals(user.questionnaires[0]);
      const today = new Date().toISOString().split('T')[0];
      const todayDate = new Date(today);

      console.log(`🎯 Calculated goals:`, goals);

      const createdGoals = await prisma.dailyGoal.upsert({
        where: {
          user_id_date: {
            user_id: userId,
            date: todayDate
          }
        },
        update: {
          calories: goals.calories,
          protein_g: goals.protein_g,
          carbs_g: goals.carbs_g,
          fats_g: goals.fats_g,
          fiber_g: goals.fiber_g,
          sodium_mg: goals.sodium_mg,
          sugar_g: goals.sugar_g,
          water_ml: goals.water_ml,
          updated_at: new Date()
        },
        create: {
          user_id: userId,
          date: todayDate,
          calories: goals.calories,
          protein_g: goals.protein_g,
          carbs_g: goals.carbs_g,
          fats_g: goals.fats_g,
          fiber_g: goals.fiber_g,
          sodium_mg: goals.sodium_mg,
          sugar_g: goals.sugar_g,
          water_ml: goals.water_ml,
        }
      });

      console.log(`✅ Force created daily goals for user: ${userId}`, {
        id: createdGoals.id,
        calories: createdGoals.calories,
        date: createdGoals.date
      });

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

  /**
   * Get user's current daily goals with caching
   */
  static async getUserDailyGoals(userId: string): Promise<NutritionGoals> {
    try {
      console.log(`📊 Getting daily goals for user: ${userId}`);
      
      // Try to get today's goals first
      const today = new Date().toISOString().split('T')[0];
      const todayGoals = await prisma.dailyGoal.findFirst({
        where: {
          user_id: userId,
          date: new Date(today)
        }
      });

      if (todayGoals) {
        console.log("✅ Found existing daily goals for today");
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
      return await this.forceCreateDailyGoalsForUser(userId);

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
   * Create daily goals for ALL users regardless of existing goals (for testing)
   */
  static async forceCreateGoalsForAllUsers(): Promise<DailyGoalCreationResult> {
    console.log("🔄 FORCE creating daily goals for ALL users...");

    const result: DailyGoalCreationResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      const today = new Date().toISOString().split('T')[0];
      const todayDate = new Date(today);

      // Get ALL users
      const allUsers = await prisma.user.findMany({
        include: {
          questionnaires: {
            orderBy: { date_completed: 'desc' },
            take: 1
          }
        }
      });

      console.log(`👥 Processing ${allUsers.length} users for daily goals`);

      for (const user of allUsers) {
        try {
          console.log(`📊 Processing user: ${user.user_id} (${user.email})`);

          const questionnaire = user.questionnaires[0];
          const goals = this.calculatePersonalizedGoals(questionnaire);

          console.log(`🎯 Goals for ${user.user_id}:`, goals);

          // Use upsert to create or update
          // Check if goal already exists first
          const existingGoal = await prisma.dailyGoal.findFirst({
            where: {
              user_id: user.user_id,
              date: todayDate
            }
          });

          let savedGoal;
          if (existingGoal) {
            console.log(`🔄 Updating existing goal for user: ${user.user_id}`);
            savedGoal = await prisma.dailyGoal.update({
              where: {
                id: existingGoal.id
              },
              data: {
                calories: goals.calories,
                protein_g: goals.protein_g,
                carbs_g: goals.carbs_g,
                fats_g: goals.fats_g,
                fiber_g: goals.fiber_g,
                sodium_mg: goals.sodium_mg,
                sugar_g: goals.sugar_g,
                water_ml: goals.water_ml,
                updated_at: new Date()
              }
            });
            result.updated++;
            console.log(`✅ UPDATED goal for user: ${user.user_id}`, {
              id: savedGoal.id,
              calories: savedGoal.calories,
              date: savedGoal.date
            });
          } else {
            console.log(`➕ Creating NEW goal for user: ${user.user_id}`);
            savedGoal = await prisma.dailyGoal.create({
              data: {
                user_id: user.user_id,
                date: todayDate,
                calories: goals.calories,
                protein_g: goals.protein_g,
                carbs_g: goals.carbs_g,
                fats_g: goals.fats_g,
                fiber_g: goals.fiber_g,
                sodium_mg: goals.sodium_mg,
                sugar_g: goals.sugar_g,
                water_ml: goals.water_ml,
              }
            });
            result.created++;
            console.log(`✅ CREATED goal for user: ${user.user_id}`, {
              id: savedGoal.id,
              calories: savedGoal.calories,
              date: savedGoal.date
            });
          }

          // Verify the goal was actually saved
          const verifyGoal = await prisma.dailyGoal.findFirst({
            where: {
              user_id: user.user_id,
              date: todayDate
            }
          });

          if (verifyGoal) {
            console.log(`✅ VERIFIED goal exists in database for user: ${user.user_id}`, {
              id: verifyGoal.id,
              calories: verifyGoal.calories,
              date: verifyGoal.date.toISOString().split('T')[0]
            });
          } else {
            console.error(`❌ VERIFICATION FAILED - Goal not found in database for user: ${user.user_id}`);
            result.errors.push(`Verification failed for user ${user.user_id}`);
          }

        } catch (userError) {
          result.errors.push(`User ${user.user_id}: ${userError instanceof Error ? userError.message : 'Unknown error'}`);
          console.error(`❌ Failed to process user ${user.user_id}:`, userError);
        }
      }

      console.log(`📊 Force creation completed:`, result);
      return result;

    } catch (error) {
      console.error("💥 Error in force creation:", error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }
}

export { EnhancedDailyGoalsService }