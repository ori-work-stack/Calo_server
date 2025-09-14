import cron from "node-cron";
import { prisma } from "../lib/database";
import { AIRecommendationService } from "./aiRecommendations";
import { DailyGoalsService } from "./dailyGoal";

export class CronJobService {
  static initializeCronJobs() {
    console.log("🚀 Initializing cron jobs...");

    // Database cleanup every 4 hours (emergency mode)
    cron.schedule("0 */4 * * *", async () => {
      console.log("🗄️ Running 4-hourly database cleanup");
      await this.emergencyDatabaseCleanup();
    });

    // Create daily goals for all users at 00:30 AM
    cron.schedule("30 0 * * *", async () => {
      console.log("📊 Running daily goals creation at 00:30 AM");
      await this.createDailyGoalsForAllUsers();
    });

    // Generate daily AI recommendations at 06:00 AM
    cron.schedule("0 6 * * *", async () => {
      console.log("🤖 Running daily AI recommendations job at 6:00 AM");
      await this.generateDailyRecommendationsForAllUsers();
    });

    // Emergency backup job - run every 2 hours for missed items
    cron.schedule("0 */2 * * *", async () => {
      console.log("🆘 Running emergency backup creation job");
      await this.emergencyCreateMissingItems();
    });

    console.log("✅ Cron jobs initialized");

    // Run immediate setup on startup
    setTimeout(async () => {
      console.log("🚀 Running immediate startup tasks...");
      try {
        await this.runImmediateCleanupAndSetup();
      } catch (error) {
        console.error("❌ Startup tasks failed:", error);
      }
    }, 3000); // Wait 3 seconds after startup
  }

  static async createDailyGoalsForAllUsers(): Promise<void> {
    console.log("📊 Starting daily goals creation...");

    try {
      // Test database connection first
      await prisma.$connect();

      const today = new Date();
      const todayString = today.toISOString().split("T")[0];
      const todayDayOfWeek = today.getDay();

      // Get users who should receive goals today
      const eligibleUsers = await prisma.user.findMany({
        where: {
          AND: [
            // Users who haven't completed questionnaire should still get basic goals
            {
              OR: [
                { is_questionnaire_completed: true },
                { is_questionnaire_completed: false },
              ],
            },
            // Don't create goals if they already exist for today
            {
              dailyGoals: {
                none: {
                  date: {
                    equals: new Date(todayString),
                  },
                },
              },
            },
          ],
        },
        include: {
          questionnaires: {
            orderBy: { date_completed: "desc" },
            take: 1,
          },
        },
      });

      console.log(
        `📊 Found ${eligibleUsers.length} potentially eligible users`
      );

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (const user of eligibleUsers) {
        try {
          // Check if this user should get goals today based on subscription and signup date
          const signupDayOfWeek = new Date(user.signup_date).getDay();
          const isPremium =
            user.subscription_type === "PREMIUM" ||
            user.subscription_type === "GOLD";

          // Premium users get daily goals every day
          // Free users only get goals on their signup day of the week
          const shouldCreateToday =
            isPremium || todayDayOfWeek === signupDayOfWeek;

          if (!shouldCreateToday) {
            skippedCount++;
            console.log(
              `⏭️ Skipped user ${user.user_id} - not their goal day (signup: ${signupDayOfWeek}, today: ${todayDayOfWeek})`
            );
            continue;
          }

          // Use the DailyGoalsService to create goals
          await DailyGoalsService.createOrUpdateDailyGoals(user.user_id);
          successCount++;
          console.log(
            `✅ Created daily goal for user: ${user.user_id} (${
              isPremium ? "Premium" : "Free"
            })`
          );
        } catch (userError) {
          errorCount++;
          console.error(
            `❌ Failed to create goal for user ${user.user_id}:`,
            userError
          );
          continue;
        }
      }

      console.log(
        `📊 Daily goals creation completed: ${successCount} success, ${errorCount} errors, ${skippedCount} skipped`
      );
    } catch (error) {
      console.error("❌ Error creating daily goals:", error);
    } finally {
      await prisma.$disconnect();
    }
  }

  private static async generateDailyRecommendationsForAllUsers(): Promise<void> {
    try {
      console.log("🤖 Starting daily AI recommendations generation...");

      // Test database connection first
      await prisma.$connect();

      const today = new Date().toISOString().split("T")[0];

      // Get all users who don't have recommendations for today
      const usersWithoutRecommendations = await prisma.user.findMany({
        where: {
          AND: [
            {
              is_questionnaire_completed: true,
            },
            {
              aiRecommendations: {
                none: {
                  date: today,
                },
              },
            },
          ],
        },
        select: {
          user_id: true,
          email: true,
          name: true,
        },
      });

      console.log(
        `🎯 Found ${usersWithoutRecommendations.length} users needing AI recommendations`
      );

      if (usersWithoutRecommendations.length === 0) {
        console.log("📝 No users need AI recommendations today");
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      // Process users sequentially to avoid overwhelming the system
      for (const user of usersWithoutRecommendations) {
        try {
          console.log(
            `🤖 Generating recommendations for user: ${
              user.name || user.email
            } (${user.user_id})`
          );

          // Generate new recommendations
          const recommendation =
            await AIRecommendationService.generateDailyRecommendations(
              user.user_id
            );

          if (recommendation) {
            successCount++;
            console.log(
              `✅ Generated recommendations for user: ${user.user_id}`
            );
          } else {
            throw new Error("No recommendation returned from AI service");
          }
        } catch (error) {
          errorCount++;
          console.error(
            `❌ Failed to generate recommendations for user ${user.user_id}:`,
            error instanceof Error ? error.message : error
          );

          // Continue with next user instead of failing completely
          continue;
        }

        // Small delay between users to be respectful
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log(
        `✅ Daily recommendations completed: ${successCount} success, ${errorCount} errors out of ${usersWithoutRecommendations.length} users`
      );
    } catch (error) {
      console.error("💥 Error in daily recommendations generation:", error);
    } finally {
      await prisma.$disconnect();
    }
  }

  private static async emergencyCreateMissingItems(): Promise<void> {
    try {
      console.log("🆘 Running emergency creation for missing items...");

      // Create missing daily goals first
      await this.createDailyGoalsForAllUsers();

      // Then create missing AI recommendations
      await this.generateDailyRecommendationsForAllUsers();

      console.log("✅ Emergency creation completed");
    } catch (error) {
      console.error("❌ Emergency creation failed:", error);
    }
  }

  private static async emergencyDatabaseCleanup(): Promise<void> {
    try {
      console.log("🚨 Starting emergency database cleanup...");

      // Test database connection first
      await prisma.$connect();

      // 1. Clean old AI recommendations (keep last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const deletedRecommendations = await prisma.aiRecommendation.deleteMany({
        where: {
          created_at: {
            lt: thirtyDaysAgo,
          },
        },
      });

      // 2. Clean old chat messages (keep last 50 per user)
      const users = await prisma.user.findMany({
        select: { user_id: true },
      });

      let totalMessagesDeleted = 0;
      for (const user of users) {
        const oldMessages = await prisma.chatMessage.findMany({
          where: { user_id: user.user_id },
          orderBy: { created_at: "desc" },
          skip: 50, // Keep latest 50 messages
          select: { message_id: true },
        });

        if (oldMessages.length > 0) {
          const deleted = await prisma.chatMessage.deleteMany({
            where: {
              message_id: {
                in: oldMessages.map((m) => m.message_id),
              },
            },
          });
          totalMessagesDeleted += deleted.count;
        }
      }

      // 3. Clean expired sessions
      const deletedSessions = await prisma.session.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      console.log(`✅ Emergency cleanup completed:
        - AI Recommendations deleted: ${deletedRecommendations.count}
        - Chat messages deleted: ${totalMessagesDeleted}
        - Expired sessions deleted: ${deletedSessions.count}`);
    } catch (error) {
      console.error("❌ Emergency database cleanup failed:", error);
    } finally {
      await prisma.$disconnect();
    }
  }

  // Manual trigger for immediate cleanup and setup
  static async runImmediateCleanupAndSetup(): Promise<void> {
    console.log("🚀 Running immediate cleanup and setup...");

    try {
      // 1. Emergency database cleanup first
      await this.emergencyDatabaseCleanup();

      // 2. Create daily goals for all users
      await this.createDailyGoalsForAllUsers();

      // 3. Generate AI recommendations if possible
      try {
        await this.generateDailyRecommendationsForAllUsers();
      } catch (aiError) {
        console.error("⚠️ AI recommendations failed, but continuing:", aiError);
      }

      console.log("✅ Immediate cleanup and setup completed successfully");
    } catch (error) {
      console.error("❌ Immediate cleanup and setup failed:", error);
      throw error;
    }
  }
}
