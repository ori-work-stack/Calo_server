import cron from "node-cron";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class UserCleanupService {
  static initializeCleanupJobs() {
    console.log("🧹 Initializing user cleanup jobs...");

    // Run cleanup every hour
    cron.schedule("0 * * * *", async () => {
      try {
        await UserCleanupService.cleanupUnpaidUsers();
        await UserCleanupService.cleanupFreeUserQuestionnaires();
      } catch (error) {
        console.error("❌ User cleanup error:", error);
      }
    });

    console.log("✅ User cleanup jobs initialized");
  }

  /**
   * Delete users who haven't completed payment within 24 hours of questionnaire completion
   */
  static async cleanupUnpaidUsers() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      // Find users who completed questionnaire more than 24h ago but still have FREE subscription
      const usersToDelete = await prisma.user.findMany({
        where: {
          is_questionnaire_completed: true,
          subscription_type: "FREE", // Changed from null to "FREE"
          created_at: {
            // Changed from updated_at to created_at
            lt: twentyFourHoursAgo,
          },
        },
      });

      if (usersToDelete.length > 0) {
        console.log(
          `🗑 Found ${usersToDelete.length} users to delete (no payment within 24h)`
        );

        for (const user of usersToDelete) {
          await UserCleanupService.deleteUserCompletely(user.user_id);
          console.log(`✅ Deleted user: ${user.email} (ID: ${user.user_id})`);
        }

        console.log(
          `✅ Cleanup completed: ${usersToDelete.length} unpaid users deleted`
        );
      }
    } catch (error) {
      console.error("❌ Error cleaning up unpaid users:", error);
    }
  }

  /**
   * Delete questionnaire data for FREE users after 7 days, reset questionnaire flag
   */
  static async cleanupFreeUserQuestionnaires() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
      // Find FREE users whose questionnaire data is older than 7 days
      const freeUsersToCleanup = await prisma.user.findMany({
        where: {
          subscription_type: {
            equals: "FREE",
          },
          is_questionnaire_completed: true,
          created_at: {
            // Changed from updated_at to created_at
            lt: sevenDaysAgo,
          },
        },
      });

      if (freeUsersToCleanup.length > 0) {
        console.log(
          `🧹 Found ${freeUsersToCleanup.length} FREE users for questionnaire cleanup`
        );

        for (const user of freeUsersToCleanup) {
          // Delete questionnaire data
          await prisma.userQuestionnaire.deleteMany({
            where: { user_id: user.user_id },
          });

          // Reset questionnaire completion flag
          await prisma.user.update({
            where: { user_id: user.user_id },
            data: {
              is_questionnaire_completed: false,
            },
          });

          console.log(
            `✅ Cleaned questionnaire data for FREE user: ${user.email}`
          );
        }

        console.log(
          `✅ FREE user questionnaire cleanup completed: ${freeUsersToCleanup.length} users processed`
        );
      }
    } catch (error) {
      console.error("❌ Error cleaning up FREE user questionnaires:", error);
    }
  }

  /**
   * Completely delete a user and all related data
   */
  static async deleteUserCompletely(userId: string) {
    try {
      // Delete in order to respect foreign key constraints
      await prisma.$transaction(async (tx) => {
        // Delete related data first
        await tx.session.deleteMany({ where: { user_id: userId } });
        await tx.userQuestionnaire.deleteMany({ where: { user_id: userId } });
        await tx.userMealPreference.deleteMany({ where: { user_id: userId } });
        await tx.nutritionPlan.deleteMany({ where: { user_id: userId } });
        await tx.connectedDevice.deleteMany({ where: { user_id: userId } });
        await tx.calendarEvent.deleteMany({ where: { user_id: userId } });
        await tx.userMealPlan.deleteMany({ where: { user_id: userId } });
        await tx.recommendedMenu.deleteMany({ where: { user_id: userId } });
        await tx.chatMessage.deleteMany({ where: { user_id: userId } });
        await tx.dailyGoal.deleteMany({ where: { user_id: userId } });
        await tx.userAchievement.deleteMany({ where: { user_id: userId } });
        await tx.shoppingList.deleteMany({ where: { user_id: userId } });
        await tx.meal.deleteMany({ where: { user_id: userId } });
        await tx.subscriptionPayment.deleteMany({ where: { user_id: userId } });
        await tx.userBadge.deleteMany({ where: { user_id: userId } });
        await tx.gamificationBadge.deleteMany({ where: { user_id: userId } });
        await tx.waterIntake.deleteMany({ where: { user_id: userId } });
        await tx.foodProduct.deleteMany({ where: { user_id: userId } });

        // Delete user last
        await tx.user.delete({ where: { user_id: userId } });
      });

      console.log(
        `✅ Successfully deleted user and all related data: ${userId}`
      );
    } catch (error) {
      console.error(`❌ Error deleting user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Manual cleanup trigger (for testing or admin use)
   */
  static async triggerManualCleanup() {
    console.log("🔧 Manual cleanup triggered");
    await UserCleanupService.cleanupUnpaidUsers();
    await UserCleanupService.cleanupFreeUserQuestionnaires();
    console.log("✅ Manual cleanup completed");
  }
}
