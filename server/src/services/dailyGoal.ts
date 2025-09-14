import { prisma } from "../lib/database";

// Define activity level type
type ActivityLevel = "NONE" | "LIGHT" | "MODERATE" | "HIGH";

// Define gender type
type Gender = "MALE" | "FEMALE";

// Define main goal type
type MainGoal = "WEIGHT_LOSS" | "WEIGHT_GAIN" | "WEIGHT_MAINTENANCE";

export class DailyGoalsService {
  static async createOrUpdateDailyGoals(userId: string) {
    try {
      console.log(`📊 Creating/updating daily goals for user: ${userId}`);

      // Get user data including subscription type and signup date
      const user = await prisma.user.findUnique({
        where: { user_id: userId },
        include: {
          questionnaires: {
            orderBy: { date_completed: "desc" },
            take: 1,
          },
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      const questionnaire = user.questionnaires[0];
      const today = new Date();
      const signupDate = new Date(user.signup_date);

      // Check if user should get new daily goals based on subscription
      const shouldCreateGoals = await this.shouldCreateDailyGoals(user, today);

      if (!shouldCreateGoals) {
        console.log(
          `⏭️ Skipping daily goals creation for user ${userId} - not due yet`
        );

        // Return existing goals if any
        const existingGoals = await prisma.dailyGoal.findFirst({
          where: { user_id: userId },
          orderBy: { date: "desc" },
        });

        return existingGoals || this.createDefaultGoals(userId, questionnaire);
      }

      // Calculate daily goals based on questionnaire
      const dailyGoals = this.calculateDailyGoals(questionnaire);

      // Check if daily goals already exist for today
      const todayString = today.toISOString().split("T")[0];
      const existingGoals = await prisma.dailyGoal.findFirst({
        where: {
          user_id: userId,
          date: todayString,
        },
      });

      let savedGoals;
      if (existingGoals) {
        // Update existing goals
        savedGoals = await prisma.dailyGoal.update({
          where: { id: existingGoals.id },
          data: {
            ...dailyGoals,
            updated_at: new Date(),
          },
        });
        console.log("✅ Daily goals updated successfully");
      } else {
        // Create new goals
        savedGoals = await prisma.dailyGoal.create({
          data: {
            user_id: userId,
            date: todayString,
            ...dailyGoals,
          },
        });
        console.log("✅ Daily goals created successfully");
      }

      return savedGoals;
    } catch (error) {
      console.error("Error creating/updating daily goals:", error);
      throw error;
    }
  }

  private static async shouldCreateDailyGoals(
    user: any,
    today: Date
  ): Promise<boolean> {
    try {
      // Premium users get daily goals every day
      if (
        user.subscription_type === "PREMIUM" ||
        user.subscription_type === "GOLD"
      ) {
        return true;
      }

      // Free users get new daily goals every 7 days based on signup day
      const signupDate = new Date(user.signup_date);
      const signupDayOfWeek = signupDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const todayDayOfWeek = today.getDay();

      // Check if today is the user's "goal creation day"
      if (todayDayOfWeek !== signupDayOfWeek) {
        return false;
      }

      // Check if goals were already created this week
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - todayDayOfWeek + signupDayOfWeek);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const existingGoalsThisWeek = await prisma.dailyGoal.findFirst({
        where: {
          user_id: user.user_id,
          created_at: {
            gte: weekStart,
            lt: weekEnd,
          },
        },
      });

      return !existingGoalsThisWeek;
    } catch (error) {
      console.error("Error checking if should create daily goals:", error);
      return false; // Err on the side of caution
    }
  }

  private static async createDefaultGoals(userId: string, questionnaire: any) {
    const defaultGoals = this.calculateDailyGoals(questionnaire);
    const today = new Date().toISOString().split("T")[0];

    return await prisma.dailyGoal.create({
      data: {
        user_id: userId,
        date: today,
        ...defaultGoals,
      },
    });
  }

  private static calculateDailyGoals(questionnaire: any) {
    // Default values
    let baseCalories = 2000;
    let baseProtein = 120;
    let baseCarbs = 250;
    let baseFats = 70;
    let baseWaterMl = 2500;

    if (questionnaire) {
      // Calculate BMR using Harris-Benedict equation
      const weight = questionnaire.weight_kg || 70;
      const height = questionnaire.height_cm || 170;
      const age = questionnaire.age || 25;
      const gender: Gender = questionnaire.gender || "MALE";

      let bmr;
      if (gender === "MALE") {
        bmr = 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age;
      } else {
        bmr = 447.593 + 9.247 * weight + 3.098 * height - 4.33 * age;
      }

      // Apply activity level multiplier
      const activityMultipliers: Record<ActivityLevel, number> = {
        NONE: 1.2,
        LIGHT: 1.375,
        MODERATE: 1.55,
        HIGH: 1.725,
      };

      const activityLevel: ActivityLevel =
        questionnaire.physical_activity_level || "MODERATE";
      const tdee = bmr * activityMultipliers[activityLevel];

      // Adjust based on goal
      const mainGoal: MainGoal = questionnaire.main_goal;
      switch (mainGoal) {
        case "WEIGHT_LOSS":
          baseCalories = Math.round(tdee - 500); // 500 calorie deficit
          break;
        case "WEIGHT_GAIN":
          baseCalories = Math.round(tdee + 300); // 300 calorie surplus
          break;
        case "WEIGHT_MAINTENANCE":
        default:
          baseCalories = Math.round(tdee);
          break;
      }

      // Calculate macros (protein: 1.6g/kg, carbs: 45-65% of calories, fats: 20-35%)
      baseProtein = Math.round(weight * 1.6);
      baseCarbs = Math.round((baseCalories * 0.5) / 4); // 50% of calories from carbs
      baseFats = Math.round((baseCalories * 0.25) / 9); // 25% of calories from fats

      // Water based on weight (35ml per kg)
      baseWaterMl = Math.round(weight * 35);
    }

    return {
      calories: baseCalories,
      protein_g: baseProtein,
      carbs_g: baseCarbs,
      fats_g: baseFats,
      fiber_g: 25,
      water_ml: baseWaterMl,
      sodium_mg: 2300,
      sugar_g: 50,
    };
  }

  static async getDailyGoals(userId: string) {
    try {
      const goals = await prisma.dailyGoal.findFirst({
        where: { user_id: userId },
      });

      if (!goals) {
        // Create default goals if none exist
        return await this.createOrUpdateDailyGoals(userId);
      }

      if (goals) {
        return {
          calories: Number(goals.calories) || 2000,
          protein_g: Number(goals.protein_g) || 150,
          carbs_g: Number(goals.carbs_g) || 250,
          fats_g: Number(goals.fats_g) || 67,
          fiber_g: Number(goals.fiber_g) || 25,
          sodium_mg: Number(goals.sodium_mg) || 2300,
          sugar_g: Number(goals.sugar_g) || 50,
          water_ml: Number(goals.water) || 2500,
        };
      }
    } catch (error) {
      console.error("Error fetching daily goals:", error);
      throw error;
    }
  }
}
