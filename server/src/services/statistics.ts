import { prisma } from "../lib/database";
import { AchievementService } from "./achievements";

export interface Achievement {
  id: string;
  key: string;
  title: string;
  description: string;
  category: string;
  xpReward: number;
  icon: string;
  rarity: string;
  progress: number;
  maxProgress: number;
  unlocked: boolean;
  unlockedDate?: string;
}

export interface StatisticsData {
  level: number;
  currentXP: number;
  totalPoints: number;
  currentStreak: number;
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
  bestStreak: number;
  happyDays: number;
  highEnergyDays: number;
  satisfiedDays: number;
  averageMealQuality: number;
}

interface UserStats {
  currentStreak: number;
  bestStreak: number;
  totalCompleteDays: number;
  level: number;
  totalWaterGoals: number;
  totalCalorieGoals: number;
  totalXP: number;
  aiRequestsCount: number;
}

export interface NutritionGoals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  fiber_g: number;
  sodium_mg: number;
  sugar_g: number;
  water_ml: number;
}

export interface PeriodStatistics {
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
  averageFluids?: number;
  averageCalories?: number;
  averageProtein?: number;
  averageCarbs?: number;
  averageFats?: number;
  averageFiber?: number;
  averageSugar?: number;
  averageSodium?: number;
}

export class StatisticsService {
  static async getUserStatistics(user_id: string) {
    try {
      console.log("📊 Getting user statistics for:", user_id);

      // Get user with gamification data
      const user = await prisma.user.findUnique({
        where: { user_id },
        select: {
          level: true,
          total_points: true,
          current_xp: true,
          current_streak: true,
          best_streak: true,
          total_complete_days: true,
          last_complete_date: true,
        },
      });

      if (!user) {
        console.log("❌ User not found, creating default stats");
        // Return default values if user not found
        return {
          user: {
            level: 1,
            total_points: 0,
            current_xp: 0,
            current_streak: 0,
            best_streak: 0,
            total_complete_days: 0,
            last_complete_date: null,
          },
          meals: {
            total_meals: 0,
            total_calories: 0,
            total_protein: 0,
            total_carbs: 0,
            total_fats: 0,
          },
          achievements: [],
        };
      }

      // Get meal statistics
      const mealStats = await prisma.meal.aggregate({
        where: { user_id },
        _count: { meal_id: true },
        _sum: {
          calories: true,
          protein_g: true,
          carbs_g: true,
          fats_g: true,
        },
      });

      // Get recent achievements
      const recentAchievements = await prisma.userAchievement.findMany({
        where: {
          user_id,
          unlocked: true,
        },
        include: {
          achievement: true,
        },
        orderBy: {
          unlocked_date: "desc",
        },
        take: 5,
      });

      console.log("✅ User statistics retrieved successfully");

      return {
        user: {
          level: user.level || 1,
          total_points: user.total_points || 0,
          current_xp: user.current_xp || 0,
          current_streak: user.current_streak || 0,
          best_streak: user.best_streak || 0,
          total_complete_days: user.total_complete_days || 0,
          last_complete_date: user.last_complete_date,
        },
        meals: {
          total_meals: mealStats._count.meal_id || 0,
          total_calories: Math.round(mealStats._sum.calories || 0),
          total_protein: Math.round(mealStats._sum.protein_g || 0),
          total_carbs: Math.round(mealStats._sum.carbs_g || 0),
          total_fats: Math.round(mealStats._sum.fats_g || 0),
        },
        achievements: recentAchievements.map((ua) => ({
          id: ua.achievement.id,
          title: ua.achievement.title,
          description: ua.achievement.description,
          icon: ua.achievement.icon,
          unlocked_date: ua.unlocked_date,
          points_awarded: ua.achievement.points_awarded,
        })),
      };
    } catch (error) {
      console.error("💥 Error getting user statistics:", error);
      throw error;
    }
  }

  static async getNutritionStatistics(
    userId: string,
    period: "today" | "week" | "month" | "custom" = "week",
    startDate?: Date,
    endDate?: Date
  ): Promise<{ success: boolean; data: StatisticsData | PeriodStatistics }> {
    try {
      console.log(
        `📊 Getting statistics for user: ${userId}, period: ${period}`
      );

      const now = new Date();
      let definedStartDate: Date;
      let definedEndDate: Date;

      if (period === "custom" && startDate && endDate) {
        definedStartDate = new Date(startDate);
        definedEndDate = new Date(endDate);
      } else {
        switch (period) {
          case "today":
            definedStartDate = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate()
            );
            definedEndDate = now;
            break;
          case "week":
            definedEndDate = now;
            definedStartDate = new Date(
              now.getTime() - 7 * 24 * 60 * 60 * 1000
            );
            break;
          case "month":
            definedEndDate = now;
            definedStartDate = new Date(
              now.getTime() - 30 * 24 * 60 * 60 * 1000
            );
            break;
          default: // Default to week if period is invalid or not provided
            definedEndDate = now;
            definedStartDate = new Date(
              now.getTime() - 7 * 24 * 60 * 60 * 1000
            );
            break;
        }
      }

      // Execute all database queries in parallel for better performance
      const [
        meals,
        user,
        dailyGoals,
        waterIntakes,
        waterIntakeCount,
        allAchievements,
        userAchievements,
      ] = await Promise.all([
        // Meals with optimized selection
        prisma.meal.findMany({
          where: {
            user_id: userId,
            created_at: {
              gte: definedStartDate,
              lte: definedEndDate,
            },
          },
          select: {
            created_at: true,
            upload_time: true,
            calories: true,
            protein_g: true,
            carbs_g: true,
            fats_g: true,
            fiber_g: true,
            sugar_g: true,
            sodium_mg: true,
            liquids_ml: true,
          },
          orderBy: {
            created_at: "desc",
          },
        }),

        // User data
        prisma.user.findUnique({
          where: { user_id: userId },
          select: {
            level: true,
            current_xp: true,
            total_points: true,
            current_streak: true,
            best_streak: true,
            total_complete_days: true,
            ai_requests_count: true,
          },
        }),

        // Daily goals
        prisma.dailyGoal.findMany({
          where: {
            user_id: userId,
            date: {
              gte: definedStartDate,
              lte: definedEndDate,
            },
          },
          orderBy: {
            date: "desc",
          },
        }),

        // Water intakes
        prisma.waterIntake.findMany({
          where: {
            user_id: userId,
            date: {
              gte: definedStartDate,
              lte: definedEndDate,
            },
          },
          select: {
            date: true,
            cups_consumed: true,
            milliliters_consumed: true,
          },
          orderBy: {
            date: "desc",
          },
        }),

        // Water intake count for achievements
        prisma.waterIntake.count({
          where: {
            user_id: userId,
            cups_consumed: { gte: 8 },
          },
        }),

        // All achievements (cached-friendly)
        prisma.achievement.findMany({
          select: {
            id: true,
            key: true,
            title: true,
            description: true,
            category: true,
            points_awarded: true,
            icon: true,
            rarity: true,
            max_progress: true,
          },
          orderBy: {
            points_awarded: "asc",
          },
        }),

        // User achievements
        prisma.userAchievement.findMany({
          where: { user_id: userId },
          select: {
            achievement_id: true,
            unlocked: true,
            unlocked_date: true,
          },
        }),
      ]);

      // Calculate calorie goal completions efficiently with error handling
      let mealDays: Array<{ count: number }> = [{ count: 0 }];
      try {
        const mealDaysResult = await prisma.meal.groupBy({
          by: ["created_at"],
          where: { user_id: userId },
          _sum: { calories: true },
          having: {
            calories: { _sum: { gte: 1800 } },
          },
        });
        mealDays = [{ count: mealDaysResult.length }];
        if (mealDays.length === 0) {
          mealDays = [{ count: 0 }];
        }
      } catch (error) {
        console.warn(
          "⚠️ Could not query meal days, using default value:",
          error.message
        );
        mealDays = [{ count: 0 }];
      }

      const userStats: UserStats = {
        currentStreak: user?.current_streak || 0,
        bestStreak: user?.best_streak || 0,
        totalCompleteDays: user?.total_complete_days || 0,
        level: user?.level || 1,
        totalWaterGoals: waterIntakeCount,
        totalCalorieGoals: mealDays[0]?.count || 0,
        totalXP: user?.total_points || 0,
        aiRequestsCount: user?.ai_requests_count || 0,
      };

      // Calculate all metrics in parallel
      const [
        dailyBreakdown,
        averages,
        streaks,
        achievementData,
        wellbeingMetrics,
      ] = await Promise.all([
        this.calculateDailyBreakdown(
          meals,
          dailyGoals,
          waterIntakes,
          definedStartDate,
          definedEndDate
        ),
        Promise.resolve(this.calculateAverages(meals)),
        this.calculateStreaksOptimized(userId, userStats, meals, waterIntakes),
        this.getDetailedAchievementsOptimized(
          allAchievements,
          userAchievements,
          userStats
        ),
        this.calculateWellbeingMetricsOptimized(
          meals,
          waterIntakes,
          definedStartDate,
          definedEndDate
        ),
      ]);

      // Always calculate daily goals sum for the period
      const userGoals = await this.getUserDailyGoals(userId);
      const periodConsumption = await this.getPeriodConsumption(
        userId,
        definedStartDate,
        definedEndDate
      );
      const totalDays = Math.max(
        1,
        Math.ceil(
          (definedEndDate.getTime() - definedStartDate.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );

      // Calculate period goals (sum of daily goals for the period)
      const periodGoals: NutritionGoals = {
        calories: userGoals.calories * totalDays,
        protein_g: userGoals.protein_g * totalDays,
        carbs_g: userGoals.carbs_g * totalDays,
        fats_g: userGoals.fats_g * totalDays,
        fiber_g: userGoals.fiber_g * totalDays,
        sodium_mg: userGoals.sodium_mg * totalDays,
        sugar_g: userGoals.sugar_g * totalDays,
        water_ml: userGoals.water_ml * totalDays,
      };

      if (
        period === "custom" ||
        period === "today" ||
        period === "week" ||
        period === "month"
      ) {
        const statisticsData = {
          period_type: period,
          start_date: definedStartDate.toISOString().split("T")[0],
          end_date: definedEndDate.toISOString().split("T")[0],
          total_days: totalDays,
          goals: periodGoals,
          consumption: periodConsumption,
          progress_percentages: this.calculateProgressPercentages(
            periodGoals,
            periodConsumption
          ),
          daily_averages: averages,
          meal_count: await this.getMealCountForPeriod(
            userId,
            definedStartDate,
            definedEndDate
          ),
          completion_rate: Math.round(
            (periodConsumption.calories / periodGoals.calories) * 100
          ),
          averageFluids: averages.fluids,
          averageCalories: averages.calories,
          averageProtein: averages.protein,
          averageCarbs: averages.carbs,
          averageFats: averages.fats,
          averageFiber: averages.fiber,
          averageSugar: averages.sugar,
          averageSodium: averages.sodium,
        };
        console.log(
          `✅ Period statistics calculated successfully for user: ${userId}`
        );
        return { success: true, data: statisticsData };
      }

      const statisticsData = {
        level: user?.level || 1,
        currentXP: user?.current_xp || 0,
        totalPoints: user?.total_points || 0,
        currentStreak: userStats.currentStreak,
        weeklyStreak: Math.floor(userStats.currentStreak / 7),
        perfectDays: wellbeingMetrics.perfectDays,
        dailyGoalDays: dailyGoals.length,
        totalDays: Math.ceil(
          (definedEndDate.getTime() - definedStartDate.getTime()) /
            (1000 * 60 * 60 * 24)
        ),
        averageCalories: averages.calories || 0,
        averageProtein: averages.protein || 0,
        averageCarbs: averages.carbs || 0,
        averageFats: averages.fats || 0,
        averageFiber: averages.fiber || 0,
        averageSugar: averages.sugar || 0,
        averageSodium: averages.sodium || 0,
        averageFluids: averages.fluids || 0,
        achievements: achievementData || [],
        dailyBreakdown: dailyBreakdown || [],
        successfulDays: streaks.successfulDays || 0,
        averageCompletion: streaks.averageCompletion || 0,
        bestStreak: userStats.bestStreak || 0,
        happyDays: wellbeingMetrics.happyDays || 0,
        highEnergyDays: wellbeingMetrics.highEnergyDays || 0,
        satisfiedDays: wellbeingMetrics.satisfiedDays || 0,
        averageMealQuality: wellbeingMetrics.averageMealQuality || 3,
      };

      console.log(`✅ Statistics calculated successfully for user: ${userId}`);
      return { success: true, data: statisticsData };
    } catch (error) {
      console.error("❌ Error getting statistics:", error);
      throw error;
    }
  }

  private static async getDetailedAchievements(
    userId: string,
    userStats: UserStats
  ): Promise<Achievement[]> {
    try {
      // Get all achievements from database
      const allAchievements = await prisma.achievement.findMany({
        orderBy: {
          points_awarded: "asc",
        },
      });

      // Get user's achievement progress
      const userAchievements = await prisma.userAchievement.findMany({
        where: { user_id: userId },
      });

      const userAchievementMap = new Map(
        userAchievements.map((ua) => [ua.achievement_id, ua])
      );

      return allAchievements.map((achievement) => {
        const userAchievement = userAchievementMap.get(achievement.id);
        const currentProgress = this.calculateAchievementProgress(
          achievement,
          userStats
        );

        return {
          id: achievement.id,
          key: achievement.key,
          title: achievement.title,
          description: achievement.description,
          category: achievement.category,
          xpReward: achievement.points_awarded,
          icon: achievement.icon || "trophy",
          rarity: achievement.rarity,
          progress: userAchievement?.unlocked
            ? achievement.max_progress
            : currentProgress,
          maxProgress: achievement.max_progress,
          unlocked: userAchievement?.unlocked || false,
          unlockedDate: userAchievement?.unlocked_date?.toISOString(),
        };
      });
    } catch (error) {
      console.error("Error getting detailed achievements:", error);
      return [];
    }
  }

  private static getDetailedAchievementsOptimized(
    allAchievements: any[],
    userAchievements: any[],
    userStats: UserStats
  ): Achievement[] {
    try {
      const userAchievementMap = new Map(
        userAchievements.map((ua) => [ua.achievement_id, ua])
      );

      return allAchievements.map((achievement) => {
        const userAchievement = userAchievementMap.get(achievement.id);
        const currentProgress = this.calculateAchievementProgress(
          achievement,
          userStats
        );

        return {
          id: achievement.id,
          key: achievement.key,
          title: achievement.title,
          description: achievement.description,
          category: achievement.category,
          xpReward: achievement.points_awarded,
          icon: achievement.icon || "trophy",
          rarity: achievement.rarity,
          progress: userAchievement?.unlocked
            ? achievement.max_progress
            : currentProgress,
          maxProgress: achievement.max_progress,
          unlocked: userAchievement?.unlocked || false,
          unlockedDate: userAchievement?.unlocked_date?.toISOString(),
        };
      });
    } catch (error) {
      console.error("Error getting detailed achievements:", error);
      return [];
    }
  }

  private static async calculateStreaksOptimized(
    userId: string,
    userStats: UserStats,
    meals: any[],
    waterIntakes: any[]
  ): Promise<{
    currentStreak: number;
    weeklyStreak: number;
    perfectDays: number;
    successfulDays: number;
    averageCompletion: number;
    bestStreak: number;
  }> {
    try {
      // Group meals by date for efficient processing
      const mealsByDate = new Map<string, any[]>();
      meals.forEach((meal) => {
        const date = meal.created_at.toISOString().split("T")[0];
        if (!mealsByDate.has(date)) {
          mealsByDate.set(date, []);
        }
        mealsByDate.get(date)!.push(meal);
      });

      let perfectDays = 0;
      let successfulDays = 0;
      let totalCompletion = 0;

      // Calculate completion metrics efficiently
      for (const waterRecord of waterIntakes) {
        const date = waterRecord.date.toISOString().split("T")[0];
        const dayMeals = mealsByDate.get(date) || [];

        const cups = waterRecord.cups_consumed || 0;
        const dailyCalories = dayMeals.reduce(
          (sum, meal) => sum + (meal.calories || 0),
          0
        );

        const waterCompletion = Math.min(100, (cups / 8) * 100);
        const nutritionCompletion = Math.min(100, (dailyCalories / 1800) * 100);
        const overallCompletion =
          waterCompletion * 0.4 + nutritionCompletion * 0.6;

        totalCompletion += overallCompletion;

        if (overallCompletion >= 80) {
          successfulDays++;
          if (overallCompletion >= 95 && cups >= 10 && dailyCalories >= 1600) {
            perfectDays++;
          }
        }
      }

      const currentStreak = userStats.currentStreak;
      const bestStreak = userStats.bestStreak;
      const weeklyStreak = Math.floor(currentStreak / 7);
      const averageCompletion =
        waterIntakes.length > 0 ? totalCompletion / waterIntakes.length : 0;

      return {
        currentStreak,
        weeklyStreak,
        perfectDays,
        successfulDays,
        averageCompletion: Math.round(averageCompletion),
        bestStreak,
      };
    } catch (error) {
      console.error("Error calculating streaks:", error);
      return {
        currentStreak: 0,
        weeklyStreak: 0,
        perfectDays: 0,
        successfulDays: 0,
        averageCompletion: 0,
        bestStreak: 0,
      };
    }
  }

  private static calculateWellbeingMetricsOptimized(
    meals: any[],
    waterIntakes: any[],
    startDate: Date,
    endDate: Date
  ): {
    happyDays: number;
    highEnergyDays: number;
    satisfiedDays: number;
    averageMealQuality: number;
    perfectDays: number;
  } {
    try {
      // Group by date for daily analysis
      const dailyData = new Map<
        string,
        {
          calories: number;
          water: number;
          mealCount: number;
          quality: number;
        }
      >();

      // Process meals efficiently
      meals.forEach((meal) => {
        const date = meal.created_at.toISOString().split("T")[0];
        if (!dailyData.has(date)) {
          dailyData.set(date, {
            calories: 0,
            water: 0,
            mealCount: 0,
            quality: 0,
          });
        }
        const day = dailyData.get(date)!;
        day.calories += meal.calories || 0;
        day.mealCount += 1;

        const proteinScore = Math.min(1, (meal.protein_g || 0) / 30);
        const fiberScore = Math.min(1, (meal.fiber_g || 0) / 8);
        const calorieScore =
          meal.calories >= 300 && meal.calories <= 800 ? 1 : 0.5;
        day.quality = Math.max(
          day.quality,
          ((proteinScore + fiberScore + calorieScore) / 3) * 5
        );
      });

      // Process water intake efficiently
      waterIntakes.forEach((water) => {
        const date = water.date.toISOString().split("T")[0];
        if (!dailyData.has(date)) {
          dailyData.set(date, {
            calories: 0,
            water: 0,
            mealCount: 0,
            quality: 3,
          });
        }
        dailyData.get(date)!.water = water.cups_consumed || 0;
      });

      let happyDays = 0;
      let highEnergyDays = 0;
      let satisfiedDays = 0;
      let totalQuality = 0;
      let qualityDays = 0;
      let perfectDays = 0;

      dailyData.forEach((day) => {
        if (day.calories >= 1500 && day.calories <= 2200 && day.water >= 6) {
          happyDays++;
        }
        if (day.calories >= 1600 && day.water >= 8 && day.mealCount >= 3) {
          highEnergyDays++;
        }
        if (day.calories >= 1400 && day.mealCount >= 2) {
          satisfiedDays++;
        }
        if (
          day.calories >= 1600 &&
          day.calories <= 2200 &&
          day.water >= 8 &&
          day.mealCount >= 3 &&
          day.quality >= 4
        ) {
          perfectDays++;
        }
        if (day.quality > 0) {
          totalQuality += day.quality;
          qualityDays++;
        }
      });

      return {
        happyDays,
        highEnergyDays,
        satisfiedDays,
        averageMealQuality: qualityDays > 0 ? totalQuality / qualityDays : 3,
        perfectDays,
      };
    } catch (error) {
      console.error("Error calculating wellbeing metrics:", error);
      return {
        happyDays: 0,
        highEnergyDays: 0,
        satisfiedDays: 0,
        averageMealQuality: 3,
        perfectDays: 0,
      };
    }
  }

  private static calculateAchievementProgress(
    achievement: any,
    userStats: UserStats
  ): number {
    switch (achievement.key) {
      case "first_scan":
        return Math.min(userStats.aiRequestsCount, 1);
      case "first_water_goal":
        return Math.min(userStats.totalWaterGoals, 1);
      case "water_warrior":
        return Math.min(userStats.totalWaterGoals, 10);
      case "hydration_habit":
        return Math.min(userStats.totalWaterGoals, 7);
      case "aqua_master":
        return Math.min(userStats.totalWaterGoals, 30);
      case "first_complete_day":
        return Math.min(userStats.totalCompleteDays, 1);
      case "total_5_days":
        return Math.min(userStats.totalCompleteDays, 5);
      case "total_10_days":
        return Math.min(userStats.totalCompleteDays, 10);
      case "total_25_days":
        return Math.min(userStats.totalCompleteDays, 25);
      case "total_50_days":
        return Math.min(userStats.totalCompleteDays, 50);
      case "total_100_days":
        return Math.min(userStats.totalCompleteDays, 100);
      case "streak_3_days":
        return Math.min(userStats.currentStreak, 3);
      case "streak_7_days":
        return Math.min(userStats.currentStreak, 7);
      case "streak_14_days":
        return Math.min(userStats.currentStreak, 14);
      case "streak_30_days":
        return Math.min(userStats.currentStreak, 30);
      case "streak_100_days":
        return Math.min(userStats.currentStreak, 100);
      case "level_5":
        return Math.min(userStats.level, 5);
      case "level_10":
        return Math.min(userStats.level, 10);
      case "level_25":
        return Math.min(userStats.level, 25);
      case "level_50":
        return Math.min(userStats.level, 50);
      default:
        return 0;
    }
  }

  private static async calculateDailyBreakdown(
    meals: any[],
    dailyGoals: any[],
    waterIntakes: any[],
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    const dailyBreakdown: any[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split("T")[0];
      const dayMeals = meals.filter(
        (meal) => meal.created_at.toISOString().split("T")[0] === dateStr
      );

      const dayGoal = dailyGoals.find(
        (goal) => goal.date.toISOString().split("T")[0] === dateStr
      );

      const dayWater = waterIntakes.find(
        (water) => water.date.toISOString().split("T")[0] === dateStr
      );

      const dayTotals = dayMeals.reduce(
        (acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein_g: acc.protein_g + (meal.protein_g || 0),
          carbs_g: acc.carbs_g + (meal.carbs_g || 0),
          fats_g: acc.fats_g + (meal.fats_g || 0),
          fiber_g: acc.fiber_g + (meal.fiber_g || 0),
          sugar_g: acc.sugar_g + (meal.sugar_g || 0),
          sodium_mg: acc.sodium_mg + (meal.sodium_mg || 0),
          liquids_ml: acc.liquids_ml + (meal.liquids_ml || 0),
        }),
        {
          calories: 0,
          protein_g: 0,
          carbs_g: 0,
          fats_g: 0,
          fiber_g: 0,
          sugar_g: 0,
          sodium_mg: 0,
          liquids_ml: dayWater?.milliliters_consumed || 0,
        }
      );

      dailyBreakdown.push({
        date: dateStr,
        ...dayTotals,
        water_cups: dayWater?.cups_consumed || 0,
        mood: "neutral",
        energy: "medium",
        satiety: "satisfied",
        meal_quality: 3,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dailyBreakdown;
  }

  private static calculateAverages(meals: any[]): {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber: number;
    sugar: number;
    sodium: number;
    fluids: number;
  } {
    if (meals.length === 0) {
      return {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        fluids: 0,
      };
    }

    // Group by date to get daily averages
    const dailyTotals = new Map<string, any>();
    meals.forEach((meal) => {
      const date = meal.upload_time.toISOString().split("T")[0];
      if (!dailyTotals.has(date)) {
        dailyTotals.set(date, {
          calories: 0,
          protein: 0,
          carbs: 0,
          fats: 0,
          fiber: 0,
          sugar: 0,
          sodium: 0,
          fluids: 0,
        });
      }
      const dayTotal = dailyTotals.get(date);
      dayTotal.calories += meal.calories || 0;
      dayTotal.protein += meal.protein_g || 0;
      dayTotal.carbs += meal.carbs_g || 0;
      dayTotal.fats += meal.fats_g || 0;
      dayTotal.fiber += meal.fiber_g || 0;
      dayTotal.sugar += meal.sugar_g || 0;
      dayTotal.sodium += meal.sodium_mg || 0;
      dayTotal.fluids += meal.liquids_ml || 0;
    });

    const numDays = dailyTotals.size || 1;
    const dailyValues = Array.from(dailyTotals.values());
    const averages = dailyValues.reduce(
      (acc, day) => ({
        calories: acc.calories + day.calories,
        protein: acc.protein + day.protein,
        carbs: acc.carbs + day.carbs,
        fats: acc.fats + day.fats,
        fiber: acc.fiber + day.fiber,
        sugar: acc.sugar + day.sugar,
        sodium: acc.sodium + day.sodium,
        fluids: acc.fluids + day.fluids,
      }),
      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        fluids: 0,
      }
    );

    return {
      calories: Math.round(averages.calories / numDays),
      protein: Math.round(averages.protein / numDays),
      carbs: Math.round(averages.carbs / numDays),
      fats: Math.round(averages.fats / numDays),
      fiber: Math.round(averages.fiber / numDays),
      sugar: Math.round(averages.sugar / numDays),
      sodium: Math.round(averages.sodium / numDays),
      fluids: Math.round(averages.fluids / numDays),
    };
  }

  // This is the old calculateStreaks function, which is replaced by calculateStreaksOptimized
  private static async calculateStreaks(
    userId: string,
    userStats: UserStats
  ): Promise<{
    currentStreak: number;
    weeklyStreak: number;
    perfectDays: number;
    successfulDays: number;
    averageCompletion: number;
    bestStreak: number;
  }> {
    try {
      // Get all water intake and meal data for comprehensive analysis
      const allWaterIntakes = await prisma.waterIntake.findMany({
        where: { user_id: userId },
        orderBy: { date: "desc" },
      });

      const allMeals = await prisma.meal.findMany({
        where: { user_id: userId },
        orderBy: { upload_time: "desc" },
        orderBy: { created_at: "desc" },
      });

      // Group meals by date
      const mealsByDate = new Map<string, any[]>();
      allMeals.forEach((meal) => {
        const date = meal.created_at.toISOString().split("T")[0];
        if (!mealsByDate.has(date)) {
          mealsByDate.set(date, []);
        }
        mealsByDate.get(date)!.push(meal);
      });

      let perfectDays = 0;
      let successfulDays = 0;
      let totalCompletion = 0;

      // Calculate completion metrics based on both water and nutrition
      for (const waterRecord of allWaterIntakes) {
        const date = waterRecord.date.toISOString().split("T")[0];
        const dayMeals = mealsByDate.get(date) || [];

        const cups = waterRecord.cups_consumed || 0;
        const dailyCalories = dayMeals.reduce(
          (sum, meal) => sum + (meal.calories || 0),
          0
        );

        // Water completion (40% weight)
        const waterCompletion = Math.min(100, (cups / 8) * 100);

        // Nutrition completion (60% weight)
        const nutritionCompletion = Math.min(100, (dailyCalories / 1800) * 100);

        // Overall completion
        const overallCompletion =
          waterCompletion * 0.4 + nutritionCompletion * 0.6;
        totalCompletion += overallCompletion;

        if (overallCompletion >= 80) {
          successfulDays++;
          if (overallCompletion >= 95 && cups >= 10 && dailyCalories >= 1600) {
            perfectDays++;
          }
        }
      }

      const currentStreak = userStats.currentStreak;
      const bestStreak = userStats.bestStreak;
      const weeklyStreak = Math.floor(currentStreak / 7);
      const averageCompletion =
        allWaterIntakes.length > 0
          ? totalCompletion / allWaterIntakes.length
          : 0;

      return {
        currentStreak,
        weeklyStreak,
        perfectDays,
        successfulDays,
        averageCompletion: Math.round(averageCompletion),
        bestStreak,
      };
    } catch (error) {
      console.error("Error calculating streaks:", error);
      return {
        currentStreak: 0,
        weeklyStreak: 0,
        perfectDays: 0,
        successfulDays: 0,
        averageCompletion: 0,
        bestStreak: 0,
      };
    }
  }

  // This is the old calculateWellbeingMetrics function, which is replaced by calculateWellbeingMetricsOptimized
  private static async calculateWellbeingMetrics(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    happyDays: number;
    highEnergyDays: number;
    satisfiedDays: number;
    averageMealQuality: number;
    perfectDays: number;
  }> {
    try {
      // Calculate wellbeing based on nutrition completion
      const meals = await prisma.meal.findMany({
        where: {
          user_id: userId,
          created_at: { gte: startDate, lte: endDate },
        },
      });

      const waterIntakes = await prisma.waterIntake.findMany({
        where: {
          user_id: userId,
          date: { gte: startDate, lte: endDate },
        },
      });

      // Group by date for daily analysis
      const dailyData = new Map<
        string,
        {
          calories: number;
          water: number;
          mealCount: number;
          quality: number;
        }
      >();

      // Process meals
      meals.forEach((meal) => {
        const date = meal.created_at.toISOString().split("T")[0];
        if (!dailyData.has(date)) {
          dailyData.set(date, {
            calories: 0,
            water: 0,
            mealCount: 0,
            quality: 0,
          });
        }
        const day = dailyData.get(date)!;
        day.calories += meal.calories || 0;
        day.mealCount += 1;

        // Calculate meal quality based on nutritional completeness
        const proteinScore = Math.min(1, (meal.protein_g || 0) / 30); // 30g per meal target
        const fiberScore = Math.min(1, (meal.fiber_g || 0) / 8); // 8g per meal target
        const calorieScore =
          meal.calories >= 300 && meal.calories <= 800 ? 1 : 0.5;
        day.quality = Math.max(
          day.quality,
          ((proteinScore + fiberScore + calorieScore) / 3) * 5
        );
      });

      // Process water intake
      waterIntakes.forEach((water) => {
        const date = water.date.toISOString().split("T")[0];
        if (!dailyData.has(date)) {
          dailyData.set(date, {
            calories: 0,
            water: 0,
            mealCount: 0,
            quality: 3,
          });
        }
        dailyData.get(date)!.water = water.cups_consumed || 0;
      });

      let happyDays = 0;
      let highEnergyDays = 0;
      let satisfiedDays = 0;
      let totalQuality = 0;
      let qualityDays = 0;
      let perfectDays = 0;

      // Analyze each day
      dailyData.forEach((day) => {
        // Happy days: good calorie intake + adequate water
        if (day.calories >= 1500 && day.calories <= 2200 && day.water >= 6) {
          happyDays++;
        }

        // High energy days: balanced nutrition + good hydration
        if (day.calories >= 1600 && day.water >= 8 && day.mealCount >= 3) {
          highEnergyDays++;
        }

        // Satisfied days: met calorie goals + reasonable meal frequency
        if (day.calories >= 1400 && day.mealCount >= 2) {
          satisfiedDays++;
        }

        // Perfect days: excellent nutrition + hydration + meal frequency
        if (
          day.calories >= 1600 &&
          day.calories <= 2200 &&
          day.water >= 8 &&
          day.mealCount >= 3 &&
          day.quality >= 4
        ) {
          perfectDays++;
        }

        if (day.quality > 0) {
          totalQuality += day.quality;
          qualityDays++;
        }
      });

      return {
        happyDays,
        highEnergyDays,
        satisfiedDays,
        averageMealQuality: qualityDays > 0 ? totalQuality / qualityDays : 3,
        perfectDays,
      };
    } catch (error) {
      console.error("Error calculating wellbeing metrics:", error);
      return {
        happyDays: 0,
        highEnergyDays: 0,
        satisfiedDays: 0,
        averageMealQuality: 3,
        perfectDays: 0,
      };
    }
  }

  static async generatePDFReport(userId: string): Promise<Buffer> {
    // This would generate a PDF report - placeholder for now
    return Buffer.from("PDF Report");
  }

  static async generateInsights(userId: string): Promise<any> {
    try {
      const statistics = await this.getNutritionStatistics(userId, "month");

      const insights = {
        mainInsights: [
          {
            type: "protein",
            message: `You're meeting protein goals ${Math.round(
              (statistics.data.averageProtein / 120) * 100
            )}% of days this month.`,
            category: "nutrition",
          },
          {
            type: "hydration",
            message: `Your water intake averaged ${statistics.data.averageFluids}ml daily.`,
            category: "lifestyle",
          },
          {
            type: "streak",
            message: `Current streak: ${statistics.data.currentStreak} days!`,
            category: "motivation",
          },
        ],
        recommendations: [
          {
            type: "fiber",
            message: "Consider adding more fiber-rich foods to your diet.",
            priority: "medium",
          },
          {
            type: "sodium",
            message: "Try to reduce sodium intake by limiting processed foods.",
            priority: "high",
          },
        ],
      };

      return { success: true, data: insights };
    } catch (error) {
      console.error("Error generating insights:", error);
      throw error;
    }
  }

  // Helper function to calculate progress percentages for PeriodStatistics
  private static calculateProgressPercentages(
    userGoals: NutritionGoals,
    consumption: NutritionGoals
  ): NutritionGoals {
    const progressPercentages: NutritionGoals = {
      calories:
        userGoals.calories > 0
          ? Math.round((consumption.calories / userGoals.calories) * 100)
          : 0,
      protein_g:
        userGoals.protein_g > 0
          ? Math.round((consumption.protein_g / userGoals.protein_g) * 100)
          : 0,
      carbs_g:
        userGoals.carbs_g > 0
          ? Math.round((consumption.carbs_g / userGoals.carbs_g) * 100)
          : 0,
      fats_g:
        userGoals.fats_g > 0
          ? Math.round((consumption.fats_g / userGoals.fats_g) * 100)
          : 0,
      fiber_g:
        userGoals.fiber_g > 0
          ? Math.round((consumption.fiber_g / userGoals.fiber_g) * 100)
          : 0,
      sodium_mg:
        userGoals.sodium_mg > 0
          ? Math.round((consumption.sodium_mg / userGoals.sodium_mg) * 100)
          : 0,
      sugar_g:
        userGoals.sugar_g > 0
          ? Math.round((consumption.sugar_g / userGoals.sugar_g) * 100)
          : 0,
      water_ml:
        userGoals.water_ml > 0
          ? Math.round((consumption.water_ml / userGoals.water_ml) * 100)
          : 0,
    };
    return progressPercentages;
  }

  // Helper function to get user's daily goals
  static async getUserDailyGoals(userId: string): Promise<NutritionGoals> {
    try {
      // Try to get user-specific goals first
      const goals = await prisma.dailyGoal.findFirst({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
      });

      if (goals) {
        return {
          calories: Number(goals.calories) || 2000,
          protein_g: Number(goals.protein_g) || 150,
          carbs_g: Number(goals.carbs_g) || 250,
          fats_g: Number(goals.fats_g) || 67,
          fiber_g: Number(goals.fiber_g) || 25,
          sodium_mg: Number(goals.sodium_mg) || 2300,
          sugar_g: Number(goals.sugar_g) || 50,
          water_ml: Number(goals.water_ml) || 2500,
        };
      }

      // Try to get goals from questionnaire if no daily goals exist
      const questionnaire = await prisma.userQuestionnaire.findFirst({
        where: { user_id: userId },
        orderBy: { date_completed: "desc" },
      });

      if (questionnaire) {
        return {
          calories: Number(questionnaire.daily_calories) || 2000,
          protein_g: Number(questionnaire.daily_protein) || 150,
          carbs_g: Number(questionnaire.daily_carbs) || 250,
          fats_g: Number(questionnaire.daily_fats) || 67,
          fiber_g: Number(questionnaire.daily_fiber) || 25,
          sodium_mg: 2300,
          sugar_g: 50,
          water_ml: Number(questionnaire.daily_water) || 2500,
        };
      }

      // Return defaults if no data found
      return {
        calories: 2000,
        protein_g: 150,
        carbs_g: 250,
        fats_g: 67,
        fiber_g: 25,
        sodium_mg: 2300,
        sugar_g: 50,
        water_ml: 2500,
      };
    } catch (error) {
      console.error("Error getting user daily goals:", error);
      // Return defaults on error to prevent complete failure
      return {
        calories: 2000,
        protein_g: 150,
        carbs_g: 250,
        fats_g: 67,
        fiber_g: 25,
        sodium_mg: 2300,
        sugar_g: 50,
        water_ml: 2500,
      };
    }
  }

  // Helper function to get consumption for a given period
  static async getPeriodConsumption(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<NutritionGoals> {
    try {
      // Get meals for the period
      const meals = await prisma.meal.findMany({
        where: {
          user_id: userId,
          created_at: {
            gte: startDate,
            // Use 'lt' for endDate to exclude the end date itself if it represents a full day
            lt: endDate,
          },
        },
        select: {
          created_at: true,
          upload_time: true,
          calories: true,
          protein_g: true,
          carbs_g: true,
          fats_g: true,
          fiber_g: true,
          sugar_g: true,
          sodium_mg: true,
          liquids_ml: true,
        },
      });

      // Calculate totals
      const totals = meals.reduce(
        (acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein_g: acc.protein_g + (meal.protein_g || 0),
          carbs_g: acc.carbs_g + (meal.carbs_g || 0),
          fats_g: acc.fats_g + (meal.fats_g || 0),
          fiber_g: acc.fiber_g + (meal.fiber_g || 0),
          sugar_g: acc.sugar_g + (meal.sugar_g || 0),
          sodium_mg: acc.sodium_mg + (meal.sodium_mg || 0),
          water_ml: acc.water_ml + (meal.liquids_ml || 0),
        }),
        {
          calories: 0,
          protein_g: 0,
          carbs_g: 0,
          fats_g: 0,
          fiber_g: 0,
          sugar_g: 0,
          sodium_mg: 0,
          water_ml: 0,
        }
      );

      // Get water intake for the period
      const waterIntakes = await prisma.waterIntake.findMany({
        where: {
          user_id: userId,
          date: {
            gte: startDate,
            lt: endDate, // Use 'lt' for endDate
          },
        },
        select: {
          milliliters_consumed: true,
        },
      });

      // Add water consumption to totals
      totals.water_ml = waterIntakes.reduce(
        (total, intake) => total + (intake.milliliters_consumed || 0),
        totals.water_ml
      );

      return totals;
    } catch (error) {
      console.error("Error getting period consumption:", error);
      throw error;
    }
  }

  // Helper function to get the total number of meals within a period
  static async getMealCountForPeriod(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    try {
      const count = await prisma.meal.count({
        where: {
          user_id: userId,
          created_at: {
            gte: startDate,
            lt: endDate, // Use 'lt' for endDate
          },
        },
      });
      return count;
    } catch (error) {
      console.error("Error getting meal count:", error);
      return 0;
    }
  }

  // This is the old getLegacyStatistics function, it seems to be a placeholder or for backward compatibility
  static async getLegacyStatistics(userId: string): Promise<any> {
    try {
      console.log("📊 Getting legacy statistics for backward compatibility");

      return {
        totalDays: 0,
        totalMeals: 0,
      };
    } catch (error) {
      console.error("Error getting legacy statistics:", error);
      throw error;
    }
  }
}
