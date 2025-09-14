import { prisma } from "../../lib/database";
import { NutritionGoals } from "../../types/statistics";

export interface DailyGoalCreationResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export class EnhancedDailyGoalsService {
  /**
   * Create daily goals for all users - SIMPLIFIED AND WORKING VERSION
   */
  static async createDailyGoalsForAllUsers(): Promise<DailyGoalCreationResult> {
    console.log("📊 Starting SIMPLIFIED daily goals creation...");

    const result: DailyGoalCreationResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      // Step 1: Get ALL users first
      console.log("👥 Step 1: Fetching ALL users from database...");
      const allUsers = await prisma.user.findMany({
        select: {
          user_id: true,
          email: true,
          subscription_type: true,
          is_questionnaire_completed: true,
          created_at: true
        }
      });

      console.log(`👥 FOUND ${allUsers.length} TOTAL USERS in database`);

      if (allUsers.length === 0) {
        console.log("❌ NO USERS FOUND IN DATABASE!");
        return result;
      }

      // Step 2: Check today's date
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      const todayDate = new Date(todayString);
      console.log(`📅 Creating goals for date: ${todayString}`);

      // Step 3: Check existing goals for today
      console.log("🔍 Step 3: Checking existing goals for today...");
      const existingGoals = await prisma.dailyGoal.findMany({
        where: {
          date: todayDate
        },
        select: {
          user_id: true,
          id: true,
          calories: true
        }
      });

      console.log(`📊 FOUND ${existingGoals.length} EXISTING GOALS for today`);
      const usersWithGoals = new Set(existingGoals.map(goal => goal.user_id));

      // Step 4: Filter users who need goals
      const usersNeedingGoals = allUsers.filter(user => !usersWithGoals.has(user.user_id));
      console.log(`🎯 USERS NEEDING GOALS: ${usersNeedingGoals.length}`);

      if (usersNeedingGoals.length === 0) {
        console.log("✅ ALL USERS ALREADY HAVE GOALS FOR TODAY");
        result.skipped = allUsers.length;
        return result;
      }

      // Step 5: Get questionnaires for users needing goals
      console.log("📋 Step 5: Getting questionnaires...");
      const userIds = usersNeedingGoals.map(u => u.user_id);
      const questionnaires = await prisma.userQuestionnaire.findMany({
        where: {
          user_id: {
            in: userIds
          }
        }
      });

      console.log(`📋 FOUND ${questionnaires.length} QUESTIONNAIRES`);

      // Group questionnaires by user_id (get latest for each user)
      const questionnaireMap = new Map();
      questionnaires.forEach(q => {
        const existing = questionnaireMap.get(q.user_id);
        if (!existing || q.date_completed > existing.date_completed) {
          questionnaireMap.set(q.user_id, q);
        }
      });

      console.log(`📋 MAPPED QUESTIONNAIRES FOR ${questionnaireMap.size} USERS`);

      // Step 6: Process each user individually
      console.log("🔄 Step 6: Processing each user...");
      for (let i = 0; i < usersNeedingGoals.length; i++) {
        const user = usersNeedingGoals[i];
        
        try {
          console.log(`\n📊 [${i + 1}/${usersNeedingGoals.length}] Processing user: ${user.user_id} (${user.email})`);

          const questionnaire = questionnaireMap.get(user.user_id);
          console.log(`📋 Questionnaire found: ${!!questionnaire}`);

          const goals = this.calculatePersonalizedGoals(questionnaire);
          console.log(`🎯 Calculated goals:`, goals);

          // DIRECT DATABASE INSERT
          console.log(`💾 Creating daily goal in database...`);
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

          console.log(`✅ CREATED GOAL IN DATABASE:`, {
            id: createdGoal.id,
            user_id: createdGoal.user_id,
            date: createdGoal.date.toISOString().split('T')[0],
            calories: createdGoal.calories
          });

          // VERIFY IT WAS ACTUALLY SAVED
          const verification = await prisma.dailyGoal.findUnique({
            where: { id: createdGoal.id }
          });

          if (verification) {
            console.log(`✅ VERIFIED: Goal exists in database with ID ${verification.id}`);
            result.created++;
          } else {
            console.error(`❌ VERIFICATION FAILED: Goal not found in database!`);
            result.errors.push(`Verification failed for user ${user.user_id}`);
          }

        } catch (userError) {
          console.error(`❌ ERROR processing user ${user.user_id}:`, userError);
          result.errors.push(`User ${user.user_id}: ${userError instanceof Error ? userError.message : 'Unknown error'}`);
        }
      }

      console.log(`\n📊 FINAL RESULT:`, result);
      return result;

    } catch (error) {
      console.error("💥 CRITICAL ERROR in daily goals creation:", error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Force create daily goals for a specific user
   */
  static async forceCreateDailyGoalsForUser(userId: string): Promise<NutritionGoals> {
    try {
      console.log(`🔄 FORCE creating daily goals for user: ${userId}`);

      // Get user with questionnaire
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

      console.log(`👤 Found user: ${user.email}`);
      console.log(`📋 Questionnaires: ${user.questionnaires.length}`);

      const questionnaire = user.questionnaires[0];
      const goals = this.calculatePersonalizedGoals(questionnaire);
      
      const today = new Date().toISOString().split('T')[0];
      const todayDate = new Date(today);

      console.log(`🎯 Calculated goals for ${userId}:`, goals);
      console.log(`📅 Creating for date: ${todayString}`);

      // Delete existing goal if it exists, then create new one
      await prisma.dailyGoal.deleteMany({
        where: {
          user_id: userId,
          date: todayDate
        }
      });

      console.log(`🗑️ Deleted any existing goals for today`);

      // Create new goal
      const createdGoals = await prisma.dailyGoal.create({
        data: {
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

      console.log(`✅ CREATED daily goal:`, {
        id: createdGoals.id,
        user_id: createdGoals.user_id,
        date: createdGoals.date.toISOString().split('T')[0],
        calories: createdGoals.calories
      });

      // Verify it exists
      const verification = await prisma.dailyGoal.findUnique({
        where: { id: createdGoals.id }
      });

      if (verification) {
        console.log(`✅ VERIFIED: Goal exists in database`);
      } else {
        console.error(`❌ VERIFICATION FAILED!`);
      }

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
      console.error(`💥 ERROR force creating daily goals for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's current daily goals
   */
  static async getUserDailyGoals(userId: string): Promise<NutritionGoals> {
    try {
      console.log(`📊 Getting daily goals for user: ${userId}`);
      
      const today = new Date().toISOString().split('T')[0];
      const todayDate = new Date(today);
      
      // Try to get today's goals
      const todayGoals = await prisma.dailyGoal.findFirst({
        where: {
          user_id: userId,
          date: todayDate
        }
      });

      if (todayGoals) {
        console.log("✅ Found existing daily goals for today");
        return {
          calories: Number(todayGoals.calories),
          protein_g: Number(todayGoals.protein_g),
          carbs_g: Number(todayGoals.carbs_g),
          fats_g: Number(todayGoals.fats_g),
          fiber_g: Number(todayGoals.fiber_g),
          sodium_mg: Number(todayGoals.sodium_mg),
          sugar_g: Number(todayGoals.sugar_g),
          water_ml: Number(todayGoals.water_ml)
        };
      }

      // If no goals for today, create them
      console.log("📊 No goals found for today, creating new ones...");
      return await this.forceCreateDailyGoalsForUser(userId);

    } catch (error) {
      console.error("💥 Error getting user daily goals:", error);
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
    console.log("🧮 Calculating personalized goals...");
    console.log("📋 Questionnaire available:", !!questionnaire);

    // Default values
    let calories = 2000;
    let protein_g = 120;
    let carbs_g = 250;
    let fats_g = 70;
    let water_ml = 2500;
    let fiber_g = 25;
    let sodium_mg = 2300;
    let sugar_g = 50;

    if (questionnaire) {
      console.log("📊 Using questionnaire data for calculations");
      console.log("👤 User data:", {
        age: questionnaire.age,
        weight: questionnaire.weight_kg,
        height: questionnaire.height_cm,
        gender: questionnaire.gender,
        goal: questionnaire.main_goal,
        activity: questionnaire.physical_activity_level
      });

      // Calculate BMR using Mifflin-St Jeor equation
      const weight = Number(questionnaire.weight_kg) || 70;
      const height = Number(questionnaire.height_cm) || 170;
      const age = Number(questionnaire.age) || 25;
      const isMale = questionnaire.gender?.toLowerCase().includes('male') || 
                     questionnaire.gender?.toLowerCase().includes('זכר') ||
                     questionnaire.gender === 'MALE';

      let bmr;
      if (isMale) {
        bmr = 10 * weight + 6.25 * height - 5 * age + 5;
      } else {
        bmr = 10 * weight + 6.25 * height - 5 * age - 161;
      }

      console.log(`🔢 BMR calculated: ${Math.round(bmr)} for ${isMale ? 'male' : 'female'}`);

      // Activity level multipliers
      const activityMultipliers = {
        'NONE': 1.2,
        'LIGHT': 1.375,
        'MODERATE': 1.55,
        'HIGH': 1.725
      };

      const activityLevel = questionnaire.physical_activity_level || 'MODERATE';
      const activityMultiplier = activityMultipliers[activityLevel] || 1.55;
      const tdee = bmr * activityMultiplier;

      console.log(`⚡ TDEE calculated: ${Math.round(tdee)} (activity: ${activityLevel}, multiplier: ${activityMultiplier})`);

      // Adjust based on goal
      const mainGoal = questionnaire.main_goal;
      console.log(`🎯 Main goal: ${mainGoal}`);

      switch (mainGoal) {
        case 'WEIGHT_LOSS':
          calories = Math.round(tdee - 500); // 500 calorie deficit
          console.log(`📉 Weight loss: ${Math.round(tdee)} - 500 = ${calories}`);
          break;
        case 'WEIGHT_GAIN':
          calories = Math.round(tdee + 300); // 300 calorie surplus
          console.log(`📈 Weight gain: ${Math.round(tdee)} + 300 = ${calories}`);
          break;
        case 'SPORTS_PERFORMANCE':
          calories = Math.round(tdee + 200); // Slight surplus for performance
          console.log(`🏃 Sports performance: ${Math.round(tdee)} + 200 = ${calories}`);
          break;
        default:
          calories = Math.round(tdee);
          console.log(`⚖️ Maintenance: ${calories}`);
      }

      // Calculate macros
      protein_g = Math.round(weight * 1.6); // 1.6g per kg body weight
      carbs_g = Math.round((calories * 0.45) / 4); // 45% of calories from carbs
      fats_g = Math.round((calories * 0.30) / 9); // 30% of calories from fats

      // Water based on weight (35ml per kg)
      water_ml = Math.round(weight * 35);
      if (activityLevel === 'HIGH') {
        water_ml += 500; // Extra water for high activity
      }

      // Adjust other nutrients
      fiber_g = Math.max(25, Math.round(calories / 80)); // 1g fiber per 80 calories, minimum 25g
      sugar_g = Math.round(calories * 0.1 / 4); // Max 10% of calories from sugar

      console.log(`🧮 Final macro calculations:`, {
        protein: `${weight}kg * 1.6 = ${protein_g}g`,
        carbs: `${calories} * 0.45 / 4 = ${carbs_g}g`,
        fats: `${calories} * 0.30 / 9 = ${fats_g}g`,
        water: `${weight}kg * 35 = ${water_ml}ml`,
        fiber: `max(25, ${calories}/80) = ${fiber_g}g`
      });
    } else {
      console.log("⚠️ No questionnaire found, using default values");
    }

    // Ensure minimum values
    calories = Math.max(1200, calories);
    protein_g = Math.max(50, protein_g);
    water_ml = Math.max(2000, water_ml);

    const finalGoals = {
      calories,
      protein_g,
      carbs_g,
      fats_g,
      fiber_g,
      water_ml,
      sodium_mg,
      sugar_g
    };

    console.log("🎯 FINAL CALCULATED GOALS:", finalGoals);
    return finalGoals;
  }

  /**
   * Force create goals for ALL users (testing/admin)
   */
  static async forceCreateGoalsForAllUsers(): Promise<DailyGoalCreationResult> {
    console.log("🚨 FORCE creating daily goals for ALL users...");

    const result: DailyGoalCreationResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      const today = new Date().toISOString().split('T')[0];
      const todayDate = new Date(today);

      console.log(`📅 Force creating goals for date: ${today}`);

      // Get ALL users with questionnaires
      const allUsers = await prisma.user.findMany({
        include: {
          questionnaires: {
            orderBy: { date_completed: 'desc' },
            take: 1
          }
        }
      });

      console.log(`👥 FORCE processing ${allUsers.length} users`);

      for (let i = 0; i < allUsers.length; i++) {
        const user = allUsers[i];
        
        try {
          console.log(`\n🔄 [${i + 1}/${allUsers.length}] FORCE processing user: ${user.user_id} (${user.email})`);

          const questionnaire = user.questionnaires[0];
          const goals = this.calculatePersonalizedGoals(questionnaire);

          console.log(`🎯 Goals calculated for ${user.user_id}:`, goals);

          // Check if goal already exists
          const existingGoal = await prisma.dailyGoal.findFirst({
            where: {
              user_id: user.user_id,
              date: todayDate
            }
          });

          if (existingGoal) {
            console.log(`🔄 UPDATING existing goal for user: ${user.user_id}`);
            const updatedGoal = await prisma.dailyGoal.update({
              where: { id: existingGoal.id },
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
            
            console.log(`✅ UPDATED goal:`, {
              id: updatedGoal.id,
              calories: updatedGoal.calories,
              date: updatedGoal.date.toISOString().split('T')[0]
            });
            result.updated++;
          } else {
            console.log(`➕ CREATING new goal for user: ${user.user_id}`);
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

            console.log(`✅ CREATED goal:`, {
              id: createdGoal.id,
              calories: createdGoal.calories,
              date: createdGoal.date.toISOString().split('T')[0]
            });
            result.created++;
          }

          // Verify the goal exists
          const verification = await prisma.dailyGoal.findFirst({
            where: {
              user_id: user.user_id,
              date: todayDate
            }
          });

          if (verification) {
            console.log(`✅ VERIFIED: Goal exists in database for user ${user.user_id}`);
          } else {
            console.error(`❌ VERIFICATION FAILED for user ${user.user_id}`);
            result.errors.push(`Verification failed for user ${user.user_id}`);
          }

        } catch (userError) {
          console.error(`❌ ERROR processing user ${user.user_id}:`, userError);
          result.errors.push(`User ${user.user_id}: ${userError instanceof Error ? userError.message : 'Unknown error'}`);
        }
      }

      console.log(`\n📊 FORCE CREATION COMPLETED:`, result);
      return result;

    } catch (error) {
      console.error("💥 ERROR in force creation:", error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }
}