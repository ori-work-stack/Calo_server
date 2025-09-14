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
  bestStreak: number;
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
  currentStreak: number;
  bestStreak: number;
  weeklyStreak: number;
  perfectDays: number;
  successfulDays: number;
  averageCompletion: number;
  happyDays: number;
  highEnergyDays: number;
  satisfiedDays: number;
  averageMealQuality: number;
  averageFluids: number;
  averageCalories: number;
  averageProtein: number;
  averageCarbs: number;
  averageFats: number;
  averageFiber: number;
  averageSugar: number;
  averageSodium: number;
}

export class StatisticsService {
  /**
   * Enhanced statistics service with comprehensive data analysis
   */
  static async getNutritionStatistics(
    userId: string,
    period: "today" | "week" | "month" | "custom" = "week",
    startDate?: Date,
    endDate?: Date
  ): Promise<{ success: boolean; data: StatisticsData | PeriodStatistics }> {
    try {
      console.log(`📊 Getting ENHANCED statistics for user: ${userId}, period: ${period}`);

      const now = new Date();
      let definedStartDate: Date;
      let definedEndDate: Date;

      // Calculate date range
      if (period === "custom" && startDate && endDate) {
        definedStartDate = new Date(startDate);
        definedEndDate = new Date(endDate);
      } else {
        switch (period) {
          case "today":
            definedStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            definedEndDate = now;
            break;
          case "week":
            definedEndDate = now;
            definedStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "month":
            definedEndDate = now;
            definedStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            definedEndDate = now;
            definedStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        }
      }

      console.log(`📅 Date range: ${definedStartDate.toISOString()} to ${definedEndDate.toISOString()}`);

      // Get all data in parallel for better performance
      const [
        user,
        meals,
        dailyGoals,
        waterIntakes,
        userAchievements,
        allAchievements
      ] = await Promise.all([
        // User data with gamification
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

        // Meals in date range
        prisma.meal.findMany({
          where: {
            user_id: userId,
            created_at: {
              gte: definedStartDate,
              lte: definedEndDate,
            },
          },
          select: {
            meal_id: true,
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
            meal_name: true,
          },
          orderBy: { created_at: "desc" },
        }),

        // Daily goals in range
        prisma.dailyGoal.findMany({
          where: {
            user_id: userId,
            date: {
              gte: definedStartDate,
              lte: definedEndDate,
            },
          },
          orderBy: { date: "desc" },
        }),

        // Water intakes in range
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
          orderBy: { date: "desc" },
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

        // All achievements
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
          orderBy: { points_awarded: "asc" },
        })
      ]);

      console.log(`📊 Data fetched:`, {
        user: !!user,
        meals: meals.length,
        dailyGoals: dailyGoals.length,
        waterIntakes: waterIntakes.length,
        achievements: userAchievements.length
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Calculate comprehensive statistics
      const userStats: UserStats = {
        currentStreak: user.current_streak || 0,
        bestStreak: user.best_streak || 0,
        totalCompleteDays: user.total_complete_days || 0,
        level: user.level || 1,
        totalWaterGoals: waterIntakes.filter(w => w.cups_consumed >= 8).length,
        totalCalorieGoals: 0, // Will calculate below
        totalXP: user.total_points || 0,
        aiRequestsCount: user.ai_requests_count || 0,
      };

      // Calculate daily averages
      const averages = this.calculateAverages(meals);
      
      // Calculate streaks and wellbeing metrics
      const streakMetrics = this.calculateStreakMetrics(meals, waterIntakes, userStats);
      const wellbeingMetrics = this.calculateWellbeingMetrics(meals, waterIntakes);

      // Get user's daily goals
      const userGoals = await this.getUserDailyGoals(userId);
      const periodConsumption = await this.getPeriodConsumption(userId, definedStartDate, definedEndDate);
      
      const totalDays = Math.max(1, Math.ceil((definedEndDate.getTime() - definedStartDate.getTime()) / (1000 * 60 * 60 * 24)));

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

      // Format achievements data
      const achievementData = this.formatAchievements(allAchievements, userAchievements, userStats);

      // Calculate daily breakdown
      const dailyBreakdown = this.calculateDailyBreakdown(meals, dailyGoals, waterIntakes, definedStartDate, definedEndDate);

      // Return period statistics for custom/specific periods
      if (period === "custom" || period === "today" || period === "week" || period === "month") {
        const periodStats: PeriodStatistics = {
          period_type: period,
          start_date: definedStartDate.toISOString().split("T")[0],
          end_date: definedEndDate.toISOString().split("T")[0],
          total_days: totalDays,
          goals: periodGoals,
          consumption: periodConsumption,
          progress_percentages: this.calculateProgressPercentages(periodGoals, periodConsumption),
          daily_averages: averages,
          meal_count: meals.length,
          completion_rate: Math.round((periodConsumption.calories / periodGoals.calories) * 100),
          currentStreak: userStats.currentStreak,
          bestStreak: userStats.bestStreak,
          weeklyStreak: Math.floor(userStats.currentStreak / 7),
          perfectDays: wellbeingMetrics.perfectDays,
          successfulDays: streakMetrics.successfulDays,
          averageCompletion: streakMetrics.averageCompletion,
          happyDays: wellbeingMetrics.happyDays,
          highEnergyDays: wellbeingMetrics.highEnergyDays,
          satisfiedDays: wellbeingMetrics.satisfiedDays,
          averageMealQuality: wellbeingMetrics.averageMealQuality,
          averageFluids: averages.fluids,
          averageCalories: averages.calories,
          averageProtein: averages.protein,
          averageCarbs: averages.carbs,
          averageFats: averages.fats,
          averageFiber: averages.fiber,
          averageSugar: averages.sugar,
          averageSodium: averages.sodium,
        };

        console.log(`✅ Period statistics calculated for user: ${userId}`);
        return { success: true, data: periodStats };
      }

      // Return general statistics data
      const statisticsData: StatisticsData = {
        level: user.level || 1,
        currentXP: user.current_xp || 0,
        totalPoints: user.total_points || 0,
        currentStreak: userStats.currentStreak,
        bestStreak: userStats.bestStreak,
        weeklyStreak: Math.floor(userStats.currentStreak / 7),
        perfectDays: wellbeingMetrics.perfectDays,
        dailyGoalDays: dailyGoals.length,
        totalDays: totalDays,
        averageCalories: averages.calories,
        averageProtein: averages.protein,
        averageCarbs: averages.carbs,
        averageFats: averages.fats,
        averageFiber: averages.fiber,
        averageSugar: averages.sugar,
        averageSodium: averages.sodium,
        averageFluids: averages.fluids,
        achievements: achievementData,
        dailyBreakdown: dailyBreakdown,
        successfulDays: streakMetrics.successfulDays,
        averageCompletion: streakMetrics.averageCompletion,
        happyDays: wellbeingMetrics.happyDays,
        highEnergyDays: wellbeingMetrics.highEnergyDays,
        satisfiedDays: wellbeingMetrics.satisfiedDays,
        averageMealQuality: wellbeingMetrics.averageMealQuality,
      };

      console.log(`✅ Statistics calculated successfully for user: ${userId}`);
      return { success: true, data: statisticsData };

    } catch (error) {
      console.error("❌ Error getting statistics:", error);
      throw error;
    }
  }

  /**
   * Calculate daily averages from meals
   */
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
      const date = meal.created_at.toISOString().split("T")[0];
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

  /**
   * Calculate streak metrics
   */
  private static calculateStreakMetrics(
    meals: any[],
    waterIntakes: any[],
    userStats: UserStats
  ): {
    currentStreak: number;
    weeklyStreak: number;
    perfectDays: number;
    successfulDays: number;
    averageCompletion: number;
    bestStreak: number;
  } {
    try {
      // Group meals by date
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

      // Calculate completion metrics
      for (const waterRecord of waterIntakes) {
        const date = waterRecord.date.toISOString().split("T")[0];
        const dayMeals = mealsByDate.get(date) || [];

        const cups = waterRecord.cups_consumed || 0;
        const dailyCalories = dayMeals.reduce((sum, meal) => sum + (meal.calories || 0), 0);

        const waterCompletion = Math.min(100, (cups / 8) * 100);
        const nutritionCompletion = Math.min(100, (dailyCalories / 1800) * 100);
        const overallCompletion = waterCompletion * 0.4 + nutritionCompletion * 0.6;

        totalCompletion += overallCompletion;

        if (overallCompletion >= 80) {
          successfulDays++;
          if (overallCompletion >= 95 && cups >= 10 && dailyCalories >= 1600) {
            perfectDays++;
          }
        }
      }

      const averageCompletion = waterIntakes.length > 0 ? totalCompletion / waterIntakes.length : 0;

      return {
        currentStreak: userStats.currentStreak,
        weeklyStreak: Math.floor(userStats.currentStreak / 7),
        perfectDays,
        successfulDays,
        averageCompletion: Math.round(averageCompletion),
        bestStreak: userStats.bestStreak,
      };
    } catch (error) {
      console.error("Error calculating streak metrics:", error);
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

  /**
   * Calculate wellbeing metrics
   */
  private static calculateWellbeingMetrics(
    meals: any[],
    waterIntakes: any[]
  ): {
    happyDays: number;
    highEnergyDays: number;
    satisfiedDays: number;
    averageMealQuality: number;
    perfectDays: number;
  } {
    try {
      // Group by date for daily analysis
      const dailyData = new Map<string, {
        calories: number;
        water: number;
        mealCount: number;
        quality: number;
      }>();

      // Process meals
      meals.forEach((meal) => {
        const date = meal.created_at.toISOString().split("T")[0];
        if (!dailyData.has(date)) {
          dailyData.set(date, { calories: 0, water: 0, mealCount: 0, quality: 0 });
        }
        const day = dailyData.get(date)!;
        day.calories += meal.calories || 0;
        day.mealCount += 1;

        // Calculate meal quality
        const proteinScore = Math.min(1, (meal.protein_g || 0) / 30);
        const fiberScore = Math.min(1, (meal.fiber_g || 0) / 8);
        const calorieScore = meal.calories >= 300 && meal.calories <= 800 ? 1 : 0.5;
        day.quality = Math.max(day.quality, ((proteinScore + fiberScore + calorieScore) / 3) * 5);
      });

      // Process water intake
      waterIntakes.forEach((water) => {
        const date = water.date.toISOString().split("T")[0];
        if (!dailyData.has(date)) {
          dailyData.set(date, { calories: 0, water: 0, mealCount: 0, quality: 3 });
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
        if (day.calories >= 1600 && day.calories <= 2200 && day.water >= 8 && day.mealCount >= 3 && day.quality >= 4) {
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

  /**
   * Format achievements data
   */
  private static formatAchievements(
    allAchievements: any[],
    userAchievements: any[],
    userStats: UserStats
  ): Achievement[] {
    const userAchievementMap = new Map(
      userAchievements.map((ua) => [ua.achievement_id, ua])
    );

    return allAchievements.map((achievement) => {
      const userAchievement = userAchievementMap.get(achievement.id);
      const currentProgress = this.calculateAchievementProgress(achievement, userStats);

      return {
        id: achievement.id,
        key: achievement.key,
        title: achievement.title,
        description: achievement.description,
        category: achievement.category,
        xpReward: achievement.points_awarded,
        icon: achievement.icon || "trophy",
        rarity: achievement.rarity,
        progress: userAchievement?.unlocked ? achievement.max_progress : currentProgress,
        maxProgress: achievement.max_progress,
        unlocked: userAchievement?.unlocked || false,
        unlockedDate: userAchievement?.unlocked_date?.toISOString(),
      };
    });
  }

  /**
   * Calculate achievement progress
   */
  private static calculateAchievementProgress(achievement: any, userStats: UserStats): number {
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

  /**
   * Calculate daily breakdown
   */
  private static calculateDailyBreakdown(
    meals: any[],
    dailyGoals: any[],
    waterIntakes: any[],
    startDate: Date,
    endDate: Date
  ): any[] {
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

  /**
   * Calculate progress percentages
   */
  private static calculateProgressPercentages(
    userGoals: NutritionGoals,
    consumption: NutritionGoals
  ): NutritionGoals {
    return {
      calories: userGoals.calories > 0 ? Math.round((consumption.calories / userGoals.calories) * 100) : 0,
      protein_g: userGoals.protein_g > 0 ? Math.round((consumption.protein_g / userGoals.protein_g) * 100) : 0,
      carbs_g: userGoals.carbs_g > 0 ? Math.round((consumption.carbs_g / userGoals.carbs_g) * 100) : 0,
      fats_g: userGoals.fats_g > 0 ? Math.round((consumption.fats_g / userGoals.fats_g) * 100) : 0,
      fiber_g: userGoals.fiber_g > 0 ? Math.round((consumption.fiber_g / userGoals.fiber_g) * 100) : 0,
      sodium_mg: userGoals.sodium_mg > 0 ? Math.round((consumption.sodium_mg / userGoals.sodium_mg) * 100) : 0,
      sugar_g: userGoals.sugar_g > 0 ? Math.round((consumption.sugar_g / userGoals.sugar_g) * 100) : 0,
      water_ml: userGoals.water_ml > 0 ? Math.round((consumption.water_ml / userGoals.water_ml) * 100) : 0,
    };
  }

  /**
   * Get user's daily goals
   */
  static async getUserDailyGoals(userId: string): Promise<NutritionGoals> {
    try {
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

      // Create goals if none exist
      const questionnaire = await prisma.userQuestionnaire.findFirst({
        where: { user_id: userId },
        orderBy: { date_completed: "desc" },
      });

      if (questionnaire) {
        const weight = questionnaire.weight_kg || 70;
        return {
          calories: 2000,
          protein_g: Math.round(weight * 1.6),
          carbs_g: 250,
          fats_g: 67,
          fiber_g: 25,
          sodium_mg: 2300,
          sugar_g: 50,
          water_ml: Math.round(weight * 35),
        };
      }

      // Return defaults
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

  /**
   * Get period consumption
   */
  static async getPeriodConsumption(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<NutritionGoals> {
    try {
      const meals = await prisma.meal.findMany({
        where: {
          user_id: userId,
          created_at: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
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

      // Add water consumption
      const waterIntakes = await prisma.waterIntake.findMany({
        where: {
          user_id: userId,
          date: { gte: startDate, lte: endDate },
        },
        select: { milliliters_consumed: true },
      });

      totals.water_ml += waterIntakes.reduce(
        (total, intake) => total + (intake.milliliters_consumed || 0),
        0
      );

      return totals;
    } catch (error) {
      console.error("Error getting period consumption:", error);
      return {
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fats_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        sodium_mg: 0,
        water_ml: 0,
      };
    }
  }

  /**
   * Get meal count for period
   */
  static async getMealCountForPeriod(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    try {
      return await prisma.meal.count({
        where: {
          user_id: userId,
          created_at: { gte: startDate, lte: endDate },
        },
      });
    } catch (error) {
      console.error("Error getting meal count:", error);
      return 0;
    }
  }

  /**
   * Generate PDF report
   */
  static async generatePDFReport(userId: string): Promise<Buffer> {
    return Buffer.from("PDF Report Placeholder");
  }

  /**
   * Generate insights
   */
  static async generateInsights(userId: string): Promise<any> {
    try {
      const statistics = await this.getNutritionStatistics(userId, "month");

      const insights = {
        mainInsights: [
          {
            type: "protein",
            message: `You're meeting protein goals consistently.`,
            category: "nutrition",
          },
          {
            type: "hydration",
            message: `Your water intake is on track.`,
            category: "lifestyle",
          },
          {
            type: "streak",
            message: `Keep up the great work with your current streak!`,
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
}