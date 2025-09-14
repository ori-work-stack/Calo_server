import { prisma } from "../lib/database";

export interface UserStats {
  currentStreak: number;
  bestStreak: number;
  totalCompleteDays: number;
  level: number;
  totalWaterGoals: number;
  totalCalorieGoals: number;
  totalXP: number;
  aiRequestsCount: number;
}

export interface Achievement {
  id: string;
  key: string;
  title: string;
  description: string;
  category: "MILESTONE" | "GOAL" | "STREAK" | "LEVEL" | "SPECIAL";
  xpReward: number;
  icon: string;
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
  progress: number;
  maxProgress: number;
  unlocked: boolean;
  unlockedDate?: Date;
}

export class AchievementService {
  // Icon mappings for achievements by category
  private static getIconForKey(key: string, category: string): string {
    const categoryIcons: { [key: string]: string } = {
      MILESTONE: "trophy",
      GOAL: "target",
      STREAK: "flame",
      LEVEL: "star",
      SPECIAL: "sparkles",
    };

    const specificIcons: { [key: string]: string } = {
      // Water achievements
      first_water_goal: "droplets",
      water_warrior: "waves",
      hydration_habit: "droplets",
      aqua_master: "mountain-snow",

      // Meal achievements
      first_scan: "camera",
      calorie_champion: "apple",
      protein_power: "dumbbell",
      fiber_friend: "wheat",

      // Time-based
      early_bird: "sunrise",
      night_owl: "moon",
      weekend_warrior: "calendar",

      // Progress
      consistency_king: "bar-chart-3",
      macro_master: "target",
      iron_will: "gem",
      balanced_week: "scale",
    };

    return specificIcons[key] || categoryIcons[category] || "award";
  }

  // Color mappings for rarity
  private static getColorForRarity(rarity: string): string {
    const colorMap: { [key: string]: string } = {
      COMMON: "#CD7F32", // Bronze
      UNCOMMON: "#16A085", // Green
      RARE: "#3498DB", // Blue
      EPIC: "#9B59B6", // Purple
      LEGENDARY: "#F39C12", // Gold
    };

    return colorMap[rarity] || "#95A5A6";
  }

  // Get all achievements from database
  private static async getAllAchievements() {
    return await prisma.achievement.findMany({
      orderBy: { points_awarded: "asc" },
    });
  }

  // Calculate current progress for an achievement
  private static calculateAchievementProgress(
    achievement: any,
    userStats: UserStats
  ): number {
    switch (achievement.key) {
      case "first_scan":
        return Math.min(userStats.aiRequestsCount, achievement.max_progress);
      case "first_water_goal":
        return Math.min(userStats.totalWaterGoals, achievement.max_progress);
      case "water_warrior":
        return Math.min(userStats.totalWaterGoals, 10);
      case "hydration_habit":
        return Math.min(userStats.totalWaterGoals, 7);
      case "aqua_master":
        return Math.min(userStats.totalWaterGoals, 30);
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

  static async checkAndAwardAchievements(userId: string): Promise<{
    newAchievements: Achievement[];
    xpGained: number;
    leveledUp: boolean;
    newLevel?: number;
  }> {
    try {
      console.log("🏆 Checking achievements for user:", userId);

      // Get user stats
      const user = await prisma.user.findUnique({
        where: { user_id: userId },
        select: {
          current_streak: true,
          best_streak: true,
          total_complete_days: true,
          level: true,
          current_xp: true,
          total_points: true,
          ai_requests_count: true,
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Get water intake count
      const waterIntakeCount = await prisma.waterIntake.count({
        where: {
          user_id: userId,
          cups_consumed: { gte: 8 },
        },
      });

      // Get calorie goal completions
      const mealDays = await prisma.meal.groupBy({
        by: ["upload_time"],
        where: { user_id: userId },
        _sum: { calories: true },
        having: {
          calories: { _sum: { gte: 1800 } },
        },
      });

      const userStats: UserStats = {
        currentStreak: user.current_streak || 0,
        bestStreak: user.best_streak || 0,
        totalCompleteDays: user.total_complete_days || 0,
        level: user.level || 1,
        totalWaterGoals: waterIntakeCount,
        totalCalorieGoals: mealDays.length,
        totalXP: user.total_points || 0,
        aiRequestsCount: user.ai_requests_count || 0,
      };

      // Get existing achievements
      const existingAchievements = await prisma.userAchievement.findMany({
        where: { user_id: userId, unlocked: true },
        select: { achievement_id: true },
      });

      const existingIds = existingAchievements.map((a) => a.achievement_id);
      const newAchievements: Achievement[] = [];
      let totalXPGained = 0;

      // Fetch all active achievements from the database
      const activeAchievements = await this.getAllAchievements();

      // Check each achievement
      for (const achievement of activeAchievements) {
        if (existingIds.includes(achievement.id)) continue;

        const currentProgress = this.calculateAchievementProgress(
          achievement,
          userStats
        );
        const shouldUnlock = currentProgress >= achievement.max_progress;

        if (shouldUnlock) {
          // Award achievement to user
          await prisma.userAchievement.upsert({
            where: {
              user_id_achievement_id: {
                user_id: userId,
                achievement_id: achievement.id,
              },
            },
            update: {
              unlocked: true,
              unlocked_date: new Date(),
              progress: achievement.max_progress,
            },
            create: {
              user_id: userId,
              achievement_id: achievement.id,
              progress: achievement.max_progress,
              unlocked: true,
              unlocked_date: new Date(),
            },
          });

          newAchievements.push({
            id: achievement.id,
            key: achievement.key,
            title: achievement.title,
            description: achievement.description,
            category: achievement.category as
              | "MILESTONE"
              | "GOAL"
              | "STREAK"
              | "LEVEL"
              | "SPECIAL",
            xpReward: achievement.points_awarded,
            icon: this.getIconForKey(achievement.key, achievement.category),
            rarity: achievement.rarity as
              | "COMMON"
              | "UNCOMMON"
              | "RARE"
              | "EPIC"
              | "LEGENDARY",
            progress: achievement.max_progress,
            maxProgress: achievement.max_progress,
            unlocked: true,
          });

          totalXPGained += achievement.points_awarded;
          console.log(
            `🎉 Achievement unlocked: ${achievement.title} (+${achievement.points_awarded} XP)`
          );
        }
      }

      // Update user XP and level with proper level-up detection
      let leveledUp = false;
      let newLevel = user.level || 1;
      let previousLevel = user.level || 1;

      if (totalXPGained > 0) {
        const newTotalPoints = (user.total_points || 0) + totalXPGained;
        const newCurrentXP = (user.current_xp || 0) + totalXPGained;

        // Calculate new level (100 XP per level)
        const calculatedLevel = Math.floor(newTotalPoints / 100) + 1;

        // Only mark as leveled up if level actually increases
        if (calculatedLevel > previousLevel) {
          leveledUp = true;
          newLevel = calculatedLevel;
          console.log(
            `🎉 User leveled up from ${previousLevel} to ${newLevel}!`
          );
        }

        const finalCurrentXP = newCurrentXP % 100;

        await prisma.user.update({
          where: { user_id: userId },
          data: {
            total_points: newTotalPoints,
            current_xp: finalCurrentXP,
            level: newLevel,
          },
        });

        console.log(
          `✅ Updated user XP: +${totalXPGained} XP, Level: ${newLevel}/${previousLevel}, Current XP: ${finalCurrentXP}/100`
        );
      }

      return {
        newAchievements,
        xpGained: totalXPGained,
        leveledUp,
        newLevel: leveledUp ? newLevel : undefined,
      };
    } catch (error) {
      console.error("Error checking achievements:", error);
      return {
        newAchievements: [],
        xpGained: 0,
        leveledUp: false,
      };
    }
  }

  static async getUserAchievements(userId: string): Promise<{
    unlockedAchievements: Achievement[];
    lockedAchievements: Achievement[];
    userStats: any;
  }> {
    try {
      console.log("📊 Getting user achievements for:", userId);

      const user = await prisma.user.findUnique({
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
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Get current user progress for achievements
      const waterIntakeCount = await prisma.waterIntake.count({
        where: {
          user_id: userId,
          cups_consumed: { gte: 8 },
        },
      });

      const mealDays = await prisma.meal.groupBy({
        by: ["created_at"],
        where: { user_id: userId },
        _sum: { calories: true },
        having: {
          calories: { _sum: { gte: 1800 } },
        },
      });

      const userStats: UserStats = {
        currentStreak: user.current_streak || 0,
        bestStreak: user.best_streak || 0,
        totalCompleteDays: user.total_complete_days || 0,
        level: user.level || 1,
        totalWaterGoals: waterIntakeCount,
        totalCalorieGoals: mealDays.length,
        totalXP: user.total_points || 0,
        aiRequestsCount: user.ai_requests_count || 0,
      };

      const userAchievements = await prisma.userAchievement.findMany({
        where: { user_id: userId },
        include: { achievement: true },
      });

      const unlockedIds = userAchievements
        .filter((ua) => ua.unlocked)
        .map((ua) => ua.achievement_id);

      // Fetch all active achievements from the database
      const allAchievements = await this.getAllAchievements();

      const unlockedAchievements: Achievement[] = allAchievements
        .filter((achievement) => unlockedIds.includes(achievement.id))
        .map((achievement) => {
          const userAchievement = userAchievements.find(
            (ua) => ua.achievement_id === achievement.id
          );
          return {
            id: achievement.id,
            key: achievement.key,
            title: achievement.title,
            description: achievement.description,
            category: achievement.category as
              | "MILESTONE"
              | "GOAL"
              | "STREAK"
              | "LEVEL"
              | "SPECIAL",
            xpReward: achievement.points_awarded,
            icon:
              achievement.icon ||
              this.getIconForKey(achievement.key, achievement.category),
            rarity: achievement.rarity as
              | "COMMON"
              | "UNCOMMON"
              | "RARE"
              | "EPIC"
              | "LEGENDARY",
            progress: achievement.max_progress,
            maxProgress: achievement.max_progress,
            unlocked: true,
            unlockedDate: userAchievement?.unlocked_date,
          };
        });

      const lockedAchievements: Achievement[] = allAchievements
        .filter((achievement) => !unlockedIds.includes(achievement.id))
        .map((achievement) => {
          const currentProgress = this.calculateAchievementProgress(
            achievement,
            userStats
          );
          return {
            id: achievement.id,
            key: achievement.key,
            title: achievement.title,
            description: achievement.description,
            category: achievement.category as
              | "MILESTONE"
              | "GOAL"
              | "STREAK"
              | "LEVEL"
              | "SPECIAL",
            xpReward: achievement.points_awarded,
            icon:
              achievement.icon ||
              this.getIconForKey(achievement.key, achievement.category),
            rarity: achievement.rarity as
              | "COMMON"
              | "UNCOMMON"
              | "RARE"
              | "EPIC"
              | "LEGENDARY",
            progress: currentProgress,
            maxProgress: achievement.max_progress,
            unlocked: false,
          };
        });

      return {
        unlockedAchievements,
        lockedAchievements,
        userStats: {
          level: user?.level || 1,
          currentXP: user?.current_xp || 0,
          totalPoints: user?.total_points || 0,
          currentStreak: user?.current_streak || 0,
          bestStreak: user?.best_streak || 0,
          totalCompleteDays: user?.total_complete_days || 0,
          xpToNextLevel: 100 - (user?.current_xp || 0),
          xpProgress: ((user?.current_xp || 0) / 100) * 100,
        },
      };
    } catch (error) {
      console.error("Error getting user achievements:", error);
      return {
        unlockedAchievements: [],
        lockedAchievements: [],
        userStats: {
          level: 1,
          currentXP: 0,
          totalPoints: 0,
          currentStreak: 0,
          bestStreak: 0,
          totalCompleteDays: 0,
          xpToNextLevel: 100,
          xpProgress: 0,
        },
      };
    }
  }

  // Helper function to check if yesterday was a completed day
  private static async wasYesterDayComplete(
    userId: string,
    date: Date
  ): Promise<boolean> {
    const yesterday = new Date(date);
    yesterday.setHours(0, 0, 0, 0);

    const completedMeals = await prisma.meal.count({
      where: {
        user_id: userId,
        upload_time: {
          gte: yesterday,
          lt: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000),
        },
        calories: { gte: 1800 },
      },
    });

    const completedWaterIntake = await prisma.waterIntake.count({
      where: {
        user_id: userId,
        date: {
          gte: yesterday,
          lt: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000),
        },
        cups_consumed: { gte: 8 },
      },
    });

    return completedMeals > 0 && completedWaterIntake > 0;
  }

  static async updateUserProgress(
    userId: string,
    completeDay: boolean = false,
    waterGoalComplete: boolean = false,
    calorieGoalComplete: boolean = false,
    xpAwarded: number = 0
  ): Promise<{
    newAchievements: Achievement[];
    xpGained: number;
    leveledUp: boolean;
    newLevel?: number;
  }> {
    try {
      console.log(
        "🏆 Updating user progress and checking achievements for:",
        userId
      );

      // Update user stats if needed
      if (completeDay) {
        const user = await prisma.user.findUnique({
          where: { user_id: userId },
          select: {
            current_streak: true,
            best_streak: true,
            total_complete_days: true,
          },
        });

        if (user) {
          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);

          const yesterdayComplete = await this.wasYesterDayComplete(
            userId,
            yesterday
          );
          const newStreak = yesterdayComplete
            ? (user.current_streak || 0) + 1
            : 1;
          const newBestStreak = Math.max(newStreak, user.best_streak || 0);
          const newTotalCompleteDays = (user.total_complete_days || 0) + 1;

          await prisma.user.update({
            where: { user_id: userId },
            data: {
              current_streak: newStreak,
              best_streak: newBestStreak,
              total_complete_days: newTotalCompleteDays,
            },
          });
        }
      }

      // Check and award achievements
      return await this.checkAndAwardAchievements(userId);
    } catch (error) {
      console.error("💥 Error updating user progress:", error);
      return {
        newAchievements: [],
        xpGained: 0,
        leveledUp: false,
      };
    }
  }
}
