import { prisma } from "../../lib/database";
import { NutritionGoals } from "../../types/statistics";

export interface DailyGoalCreationResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  details: Array<{
    user_id: string;
    action: 'created' | 'updated' | 'skipped' | 'error';
    message: string;
  }>;
}

export class EnhancedDailyGoalsService {
  /**
   * FIXED - Create daily goals for all users with PROPER upsert operations
   */
  static async createDailyGoalsForAllUsers(): Promise<DailyGoalCreationResult> {
    console.log("📊 === STARTING DAILY GOALS CREATION (FIXED VERSION) ===");

    const result: DailyGoalCreationResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      details: []
    };

    try {
      // Step 1: Get today's date in the correct format
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      const todayDate = new Date(todayString);
      
      console.log(`📅 TODAY: ${todayString}`);
      console.log(`📅 TODAY DATE OBJECT: ${todayDate.toISOString()}`);

      // Step 2: Get ALL users from database
      console.log("👥 FETCHING ALL USERS...");
      const allUsers = await prisma.user.findMany({
        select: {
          user_id: true,
          email: true,
          subscription_type: true,
          is_questionnaire_completed: true,
          created_at: true
        }
      });

      console.log(`👥 TOTAL USERS FOUND: ${allUsers.length}`);
      
      if (allUsers.length === 0) {
        console.log("❌ NO USERS FOUND IN DATABASE!");
        return result;
      }

      // Step 3: Get questionnaires for personalized goals
      console.log("📋 FETCHING QUESTIONNAIRES...");
      const questionnaires = await prisma.userQuestionnaire.findMany({
        select: {
          user_id: true,
          age: true,
          weight_kg: true,
          height_cm: true,
          gender: true,
          main_goal: true,
          physical_activity_level: true,
          date_completed: true
        }
      });

      // Group questionnaires by user_id (get latest for each user)
      const questionnaireMap = new Map();
      questionnaires.forEach(q => {
        const existing = questionnaireMap.get(q.user_id);
        if (!existing || q.date_completed > existing.date_completed) {
          questionnaireMap.set(q.user_id, q);
        }
      });

      console.log(`📋 USERS WITH QUESTIONNAIRES: ${questionnaireMap.size}`);

      // Step 4: Check existing goals for today
      console.log("🔍 CHECKING EXISTING GOALS FOR TODAY...");
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

      console.log(`📊 EXISTING GOALS FOR TODAY: ${existingGoals.length}`);
      const existingUserIds = new Set(existingGoals.map(g => g.user_id));

      // Step 5: Process EACH user individually with UPSERT operations
      for (let i = 0; i < allUsers.length; i++) {
        const user = allUsers[i];
        
        try {
          console.log(`\n📊 [${i + 1}/${allUsers.length}] PROCESSING USER: ${user.user_id} (${user.email})`);

          // Get questionnaire for this user
          const questionnaire = questionnaireMap.get(user.user_id);
          console.log(`📋 Questionnaire found for ${user.user_id}: ${!!questionnaire}`);

          // Calculate personalized goals
          const goals = this.calculatePersonalizedGoals(questionnaire);
          console.log(`🎯 Calculated goals for ${user.user_id}:`, goals);

          // Use UPSERT to handle existing goals properly
          console.log(`💾 UPSERTING daily goal for user: ${user.user_id}...`);
          
          const upsertedGoal = await prisma.dailyGoal.upsert({
            where: {
              user_id_date: {
                user_id: user.user_id,
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

          // Determine if it was created or updated
          const wasExisting = existingUserIds.has(user.user_id);
          
          if (wasExisting) {
            console.log(`🔄 UPDATED existing goal for user: ${user.user_id}`);
            result.updated++;
            result.details.push({
              user_id: user.user_id,
              action: 'updated',
              message: `Goal updated with ID ${upsertedGoal.id}`
            });
          } else {
            console.log(`✅ CREATED new goal for user: ${user.user_id}`);
            result.created++;
            result.details.push({
              user_id: user.user_id,
              action: 'created',
              message: `Goal created with ID ${upsertedGoal.id}`
            });
          }

          console.log(`✅ UPSERTED GOAL:`, {
            id: upsertedGoal.id,
            user_id: upsertedGoal.user_id,
            date: upsertedGoal.date.toISOString(),
            calories: upsertedGoal.calories,
            action: wasExisting ? 'UPDATED' : 'CREATED'
          });

          // IMMEDIATE VERIFICATION - Check if it actually exists
          const verification = await prisma.dailyGoal.findUnique({
            where: { id: upsertedGoal.id }
          });

          if (verification) {
            console.log(`✅ VERIFIED: Goal exists in database with ID ${verification.id}`);
          } else {
            console.error(`❌ VERIFICATION FAILED: Goal not found in database!`);
            result.errors.push(`Verification failed for user ${user.user_id}`);
          }

        } catch (userError) {
          console.error(`❌ ERROR processing user ${user.user_id}:`, userError);
          result.errors.push(`User ${user.user_id}: ${userError instanceof Error ? userError.message : 'Unknown error'}`);
          result.details.push({
            user_id: user.user_id,
            action: 'error',
            message: userError instanceof Error ? userError.message : 'Unknown error'
          });
        }
      }

      // Step 6: Final verification - count all goals for today
      console.log("\n🔍 FINAL VERIFICATION: Counting all goals for today...");
      const finalGoalCount = await prisma.dailyGoal.count({
        where: {
          date: todayDate
        }
      });

      console.log(`📊 TOTAL GOALS IN DATABASE FOR TODAY: ${finalGoalCount}`);

      // List all goals for today for verification
      const allTodayGoals = await prisma.dailyGoal.findMany({
        where: {
          date: todayDate
        },
        select: {
          id: true,
          user_id: true,
          calories: true,
          created_at: true,
          updated_at: true
        }
      });

      console.log(`📋 ALL GOALS FOR TODAY (${allTodayGoals.length}):`);
      allTodayGoals.forEach((goal, index) => {
        console.log(`  ${index + 1}. ID: ${goal.id}, User: ${goal.user_id}, Calories: ${goal.calories}, Created: ${goal.created_at.toISOString()}, Updated: ${goal.updated_at.toISOString()}`);
      });

      console.log(`\n📊 === FINAL RESULT ===`);
      console.log(`✅ Created: ${result.created}`);
      console.log(`🔄 Updated: ${result.updated}`);
      console.log(`⏭️ Skipped: ${result.skipped}`);
      console.log(`❌ Errors: ${result.errors.length}`);
      console.log(`📊 Total goals in DB: ${finalGoalCount}`);

      return result;

    } catch (error) {
      console.error("💥 CRITICAL ERROR in daily goals creation:", error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Force create daily goals for ALL users - TESTING VERSION with UPSERT
   */
  static async forceCreateGoalsForAllUsers(): Promise<DailyGoalCreationResult> {
    console.log("🚨 === FORCE CREATING DAILY GOALS FOR ALL USERS ===");

    const result: DailyGoalCreationResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      details: []
    };

    try {
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      const todayDate = new Date(todayString);
      
      console.log(`📅 Force creating goals for date: ${todayString}`);
      console.log(`📅 Date object: ${todayDate.toISOString()}`);

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

      // Get existing goals to determine create vs update
      const existingGoals = await prisma.dailyGoal.findMany({
        where: {
          date: todayDate
        },
        select: {
          user_id: true
        }
      });

      const existingUserIds = new Set(existingGoals.map(g => g.user_id));
      console.log(`📊 Users with existing goals: ${existingUserIds.size}`);

      for (let i = 0; i < allUsers.length; i++) {
        const user = allUsers[i];
        
        try {
          console.log(`\n🔄 [${i + 1}/${allUsers.length}] FORCE processing user: ${user.user_id} (${user.email})`);

          const questionnaire = user.questionnaires[0];
          const goals = this.calculatePersonalizedGoals(questionnaire);
          
          console.log(`🎯 Goals calculated for ${user.user_id}:`, goals);

          // Use UPSERT to handle existing goals properly
          console.log(`💾 UPSERTING goal for user: ${user.user_id}`);
          
          const upsertedGoal = await prisma.dailyGoal.upsert({
            where: {
              user_id_date: {
                user_id: user.user_id,
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

          // Determine if it was created or updated
          const wasExisting = existingUserIds.has(user.user_id);
          
          if (wasExisting) {
            console.log(`🔄 UPDATED goal for user: ${user.user_id}`);
            result.updated++;
            result.details.push({
              user_id: user.user_id,
              action: 'updated',
              message: `Goal updated with ID ${upsertedGoal.id}`
            });
          } else {
            console.log(`✅ CREATED goal for user: ${user.user_id}`);
            result.created++;
            result.details.push({
              user_id: user.user_id,
              action: 'created',
              message: `Goal created with ID ${upsertedGoal.id}`
            });
          }

          console.log(`✅ UPSERTED GOAL:`, {
            id: upsertedGoal.id,
            user_id: upsertedGoal.user_id,
            date: upsertedGoal.date.toISOString(),
            calories: upsertedGoal.calories,
            action: wasExisting ? 'UPDATED' : 'CREATED'
          });

          // IMMEDIATE VERIFICATION
          const verification = await prisma.dailyGoal.findUnique({
            where: { id: upsertedGoal.id }
          });

          if (verification) {
            console.log(`✅ VERIFIED: Goal exists in database with ID ${verification.id}`);
          } else {
            console.error(`❌ VERIFICATION FAILED!`);
            result.errors.push(`Verification failed for user ${user.user_id}`);
          }

        } catch (userError) {
          console.error(`❌ ERROR processing user ${user.user_id}:`, userError);
          result.errors.push(`User ${user.user_id}: ${userError instanceof Error ? userError.message : 'Unknown error'}`);
          result.details.push({
            user_id: user.user_id,
            action: 'error',
            message: userError instanceof Error ? userError.message : 'Unknown error'
          });
        }
      }

      // Final verification
      const finalCount = await prisma.dailyGoal.count({
        where: {
          date: todayDate
        }
      });

      console.log(`\n📊 === FORCE CREATION COMPLETED ===`);
      console.log(`✅ Created: ${result.created}`);
      console.log(`🔄 Updated: ${result.updated}`);
      console.log(`⏭️ Skipped: ${result.skipped}`);
      console.log(`❌ Errors: ${result.errors.length}`);
      console.log(`📊 Total goals in DB: ${finalCount}`);

      // List all goals for verification
      const allGoals = await prisma.dailyGoal.findMany({
        where: { date: todayDate },
        select: {
          id: true,
          user_id: true,
          calories: true,
          protein_g: true,
          created_at: true,
          updated_at: true
        }
      });

      console.log(`📋 ALL GOALS IN DATABASE FOR TODAY:`);
      allGoals.forEach((goal, index) => {
        console.log(`  ${index + 1}. ID: ${goal.id}, User: ${goal.user_id}, Calories: ${goal.calories}, Protein: ${goal.protein_g}g`);
      });

      return result;

    } catch (error) {
      console.error("💥 ERROR in force creation:", error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Get user's current daily goals - CREATE IF MISSING using UPSERT
   */
  static async getUserDailyGoals(userId: string): Promise<NutritionGoals> {
    try {
      console.log(`📊 === GETTING DAILY GOALS FOR USER: ${userId} ===`);
      
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      const todayDate = new Date(todayString);
      
      console.log(`📅 Looking for goals on date: ${todayString}`);
      console.log(`📅 Date object: ${todayDate.toISOString()}`);
      
      // Get questionnaire for goal calculation
      const questionnaire = await prisma.userQuestionnaire.findFirst({
        where: { user_id: userId },
        orderBy: { date_completed: 'desc' }
      });

      console.log(`📋 Questionnaire found: ${!!questionnaire}`);

      // Calculate goals
      const goals = this.calculatePersonalizedGoals(questionnaire);
      console.log(`🎯 Calculated goals:`, goals);

      // Use UPSERT to get or create goals
      const dailyGoal = await prisma.dailyGoal.upsert({
        where: {
          user_id_date: {
            user_id: userId,
            date: todayDate
          }
        },
        update: {
          // Don't update existing goals unless needed
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

      console.log(`✅ UPSERTED daily goal:`, {
        id: dailyGoal.id,
        user_id: dailyGoal.user_id,
        date: dailyGoal.date.toISOString(),
        calories: dailyGoal.calories
      });

      return {
        calories: Number(dailyGoal.calories),
        protein_g: Number(dailyGoal.protein_g),
        carbs_g: Number(dailyGoal.carbs_g),
        fats_g: Number(dailyGoal.fats_g),
        fiber_g: Number(dailyGoal.fiber_g),
        sodium_mg: Number(dailyGoal.sodium_mg),
        sugar_g: Number(dailyGoal.sugar_g),
        water_ml: Number(dailyGoal.water_ml)
      };

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
   * Force create daily goals for a specific user - GUARANTEED TO WORK with UPSERT
   */
  static async forceCreateDailyGoalsForUser(userId: string): Promise<NutritionGoals> {
    try {
      console.log(`🔄 === FORCE CREATING DAILY GOALS FOR USER: ${userId} ===`);

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
      
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      const todayDate = new Date(todayString);

      console.log(`🎯 Calculated goals for ${userId}:`, goals);
      console.log(`📅 Creating for date: ${todayString}`);

      // Use UPSERT to handle existing goals
      console.log(`💾 UPSERTING goal for user: ${userId}`);
      const upsertedGoal = await prisma.dailyGoal.upsert({
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

      console.log(`✅ UPSERTED daily goal:`, {
        id: upsertedGoal.id,
        user_id: upsertedGoal.user_id,
        date: upsertedGoal.date.toISOString(),
        calories: upsertedGoal.calories
      });

      // IMMEDIATE VERIFICATION
      const verification = await prisma.dailyGoal.findUnique({
        where: { id: upsertedGoal.id }
      });

      if (verification) {
        console.log(`✅ VERIFIED: Goal exists in database with ID ${verification.id}`);
      } else {
        console.error(`❌ VERIFICATION FAILED!`);
        throw new Error("Goal creation verification failed");
      }

      // Return the upserted goals
      return {
        calories: Number(upsertedGoal.calories),
        protein_g: Number(upsertedGoal.protein_g),
        carbs_g: Number(upsertedGoal.carbs_g),
        fats_g: Number(upsertedGoal.fats_g),
        fiber_g: Number(upsertedGoal.fiber_g),
        sodium_mg: Number(upsertedGoal.sodium_mg),
        sugar_g: Number(upsertedGoal.sugar_g),
        water_ml: Number(upsertedGoal.water_ml)
      };

    } catch (error) {
      console.error(`💥 ERROR force creating daily goals for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate personalized daily goals based on questionnaire
   */
  private static calculatePersonalizedGoals(questionnaire: any): NutritionGoals {
    console.log("🧮 === CALCULATING PERSONALIZED GOALS ===");
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

    console.log("🎯 === FINAL CALCULATED GOALS ===", finalGoals);
    return finalGoals;
  }

  /**
   * Simple method to create goals for a single user - DIRECT UPSERT
   */
  static async createDailyGoalForUser(userId: string): Promise<boolean> {
    try {
      console.log(`📊 === CREATING DAILY GOAL FOR SINGLE USER: ${userId} ===`);

      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      const todayDate = new Date(todayString);

      console.log(`📅 Creating goal for date: ${todayString}`);

      // Get questionnaire
      const questionnaire = await prisma.userQuestionnaire.findFirst({
        where: { user_id: userId },
        orderBy: { date_completed: 'desc' }
      });

      // Calculate goals
      const goals = this.calculatePersonalizedGoals(questionnaire);
      console.log(`🎯 Calculated goals:`, goals);

      // Use UPSERT to handle existing goals
      console.log(`💾 UPSERTING goal in database...`);
      const upsertedGoal = await prisma.dailyGoal.upsert({
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

      console.log(`✅ GOAL UPSERTED SUCCESSFULLY:`, {
        id: upsertedGoal.id,
        user_id: upsertedGoal.user_id,
        date: upsertedGoal.date.toISOString(),
        calories: upsertedGoal.calories
      });

      // Verify it exists
      const verification = await prisma.dailyGoal.findUnique({
        where: { id: upsertedGoal.id }
      });

      if (verification) {
        console.log(`✅ VERIFIED: Goal exists in database`);
        return true;
      } else {
        console.error(`❌ VERIFICATION FAILED`);
        return false;
      }

    } catch (error) {
      console.error(`💥 ERROR creating daily goal for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Debug method to check database state
   */
  static async debugDatabaseState(): Promise<any> {
    try {
      console.log("🔍 === DEBUGGING DATABASE STATE ===");

      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      const todayDate = new Date(todayString);

      // Get total users
      const totalUsers = await prisma.user.count();
      console.log(`👥 Total users in database: ${totalUsers}`);

      // Get users with goals today
      const goalsToday = await prisma.dailyGoal.findMany({
        where: { date: todayDate },
        select: {
          id: true,
          user_id: true,
          calories: true,
          created_at: true,
          updated_at: true
        }
      });

      console.log(`📊 Goals for today (${todayString}): ${goalsToday.length}`);

      // Get all users
      const allUsers = await prisma.user.findMany({
        select: {
          user_id: true,
          email: true,
          subscription_type: true
        }
      });

      console.log(`👥 All users:`);
      allUsers.forEach((user, index) => {
        const hasGoal = goalsToday.some(g => g.user_id === user.user_id);
        console.log(`  ${index + 1}. ${user.user_id} (${user.email}) - ${user.subscription_type} - Goal: ${hasGoal ? 'YES' : 'NO'}`);
      });

      return {
        totalUsers,
        goalsToday: goalsToday.length,
        allUsers,
        goalsToday: goalsToday
      };

    } catch (error) {
      console.error("💥 Error debugging database state:", error);
      return null;
    }
  }
}