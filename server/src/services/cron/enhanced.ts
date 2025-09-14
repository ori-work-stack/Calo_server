import cron from "node-cron";
import { EnhancedDailyGoalsService } from "../database/dailyGoals";
import { EnhancedAIRecommendationService } from "../database/aiRecommendations";
import { DatabaseOptimizationService } from "../database/optimization";

export class EnhancedCronJobService {
  private static isRunning = false;
  private static lastRun = new Map<string, Date>();

  /**
   * Initialize all cron jobs with proper error handling
   */
  static initializeEnhancedCronJobs() {
    console.log("🚀 Initializing enhanced cron jobs...");

    // Daily goals creation at 00:30 AM
    cron.schedule("30 0 * * *", async () => {
      await this.runJobSafely('daily-goals', async () => {
        console.log("📊 Running daily goals creation at 00:30 AM");
        const result = await this.createDailyGoalsForAllUsers();
        console.log("✅ Daily goals creation completed:", result);
      });
    });

    // AI recommendations at 06:00 AM
    cron.schedule("0 6 * * *", async () => {
      await this.runJobSafely('ai-recommendations', async () => {
        console.log("🤖 Running AI recommendations generation at 6:00 AM");
        const result = await this.generateRecommendationsForAllUsers();
        console.log("✅ AI recommendations completed:", result);
      });
    });

    // Database optimization every 6 hours
    cron.schedule("0 */6 * * *", async () => {
      await this.runJobSafely('database-optimization', async () => {
        console.log("⚡ Running database optimization");
        const health = await DatabaseOptimizationService.checkDatabaseHealth();
        
        if (health.needsCleanup) {
          const cleanupResult = await DatabaseOptimizationService.performIntelligentCleanup();
          console.log("🧹 Database cleanup completed:", cleanupResult);
        }
        
        await DatabaseOptimizationService.optimizeDatabase();
        console.log("✅ Database optimization completed");
      });
    });

    // Emergency health check every 2 hours
    cron.schedule("0 */2 * * *", async () => {
      await this.runJobSafely('health-check', async () => {
        const health = await DatabaseOptimizationService.checkDatabaseHealth();
        
        if (health.status === 'critical') {
          console.log("🚨 Critical database state detected, running emergency recovery");
          const recovered = await DatabaseOptimizationService.emergencyRecovery();
          
          if (recovered) {
            console.log("✅ Emergency recovery successful");
          } else {
            console.error("❌ Emergency recovery failed - manual intervention required");
          }
        }
      });
    });

    console.log("✅ Enhanced cron jobs initialized");

    // Run immediate startup tasks
    setTimeout(async () => {
      await this.runStartupTasks();
    }, 5000);
  }

  /**
   * Run a cron job safely with error handling and duplicate prevention
   */
  private static async runJobSafely(jobName: string, jobFunction: () => Promise<void>) {
    if (this.isRunning) {
      console.log(`⏭️ Skipping ${jobName} - another job is running`);
      return;
    }

    const lastRunTime = this.lastRun.get(jobName);
    const now = new Date();
    
    // Prevent running the same job within 30 minutes
    if (lastRunTime && (now.getTime() - lastRunTime.getTime()) < 30 * 60 * 1000) {
      console.log(`⏭️ Skipping ${jobName} - ran recently`);
      return;
    }

    this.isRunning = true;
    this.lastRun.set(jobName, now);

    try {
      console.log(`🔄 Starting job: ${jobName}`);
      await jobFunction();
      console.log(`✅ Job completed: ${jobName}`);
    } catch (error) {
      console.error(`💥 Job failed: ${jobName}`, error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run startup tasks
   */
  private static async runStartupTasks() {
    console.log("🚀 Running startup tasks...");

    try {
      // 1. Check database health
      const health = await DatabaseOptimizationService.checkDatabaseHealth();
      console.log("📊 Database health:", health);

      // 2. Perform cleanup if needed
      if (health.needsCleanup) {
        console.log("🧹 Database needs cleanup, performing maintenance...");
        await DatabaseOptimizationService.performIntelligentCleanup();
      }

      // 3. Create missing daily goals for today
      console.log("📊 Creating missing daily goals...");
      const goalsResult = await EnhancedDailyGoalsService.createDailyGoalsForAllUsers();
      console.log("✅ Daily goals startup task completed:", goalsResult);

      // 4. Generate missing AI recommendations (if OpenAI is available)
      if (process.env.OPENAI_API_KEY) {
        console.log("🤖 Generating missing AI recommendations...");
        const recommendationsResult = await EnhancedAIRecommendationService.generateRecommendationsForAllUsers();
        console.log("✅ AI recommendations startup task completed:", recommendationsResult);
      } else {
        console.log("⚠️ OpenAI not available, skipping AI recommendations");
      }

      console.log("✅ All startup tasks completed successfully");

    } catch (error) {
      console.error("💥 Startup tasks failed:", error);
    }
  }

  /**
   * Manual trigger for immediate execution
   */
  static async runImmediateCleanupAndSetup(): Promise<void> {
    console.log("🚀 Running immediate cleanup and setup...");

    try {
      // 1. Database health check and cleanup
      const health = await DatabaseOptimizationService.checkDatabaseHealth();
      console.log("📊 Current database health:", health);

      if (health.needsCleanup || health.status !== 'healthy') {
        const cleanupResult = await DatabaseOptimizationService.performIntelligentCleanup();
        console.log("🧹 Cleanup result:", cleanupResult);
      }

      // 2. Optimize database
      await DatabaseOptimizationService.optimizeDatabase();

      // 3. Create daily goals
      const goalsResult = await EnhancedDailyGoalsService.createDailyGoalsForAllUsers();
      console.log("📊 Daily goals result:", goalsResult);

      // 4. Generate AI recommendations
      if (process.env.OPENAI_API_KEY) {
        const recommendationsResult = await EnhancedAIRecommendationService.generateRecommendationsForAllUsers();
        console.log("🤖 AI recommendations result:", recommendationsResult);
      }

      console.log("✅ Immediate cleanup and setup completed successfully");

    } catch (error) {
      console.error("💥 Immediate cleanup and setup failed:", error);
      throw error;
    }
  }

  /**
   * Get cron job status
   */
  static getJobStatus(): {
    isRunning: boolean;
    lastRuns: Record<string, Date>;
    nextRuns: Record<string, string>;
  } {
    return {
      isRunning: this.isRunning,
      lastRuns: Object.fromEntries(this.lastRun),
      nextRuns: {
        'daily-goals': '00:30 AM daily',
        'ai-recommendations': '06:00 AM daily',
        'database-optimization': 'Every 6 hours',
        'health-check': 'Every 2 hours'
      }
    };
  }

  /**
   * Create daily goals for all users (wrapper method)
   */
  private static async createDailyGoalsForAllUsers() {
    try {
      return await EnhancedDailyGoalsService.createDailyGoalsForAllUsers();
    } catch (error) {
      console.error("Error in daily goals creation:", error);
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Generate recommendations for all users (wrapper method)
   */
  private static async generateRecommendationsForAllUsers() {
    try {
      return await EnhancedAIRecommendationService.generateRecommendationsForAllUsers();
    } catch (error) {
      console.error("Error in AI recommendations generation:", error);
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }
}