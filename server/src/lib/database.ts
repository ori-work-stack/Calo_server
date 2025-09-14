import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

declare global {
  var __prisma: PrismaClient | undefined;
}

// Database connection configuration
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  return url;
};

// Database cleanup utilities
export class DatabaseCleanup {
  static async checkDatabaseSize(): Promise<{
    size: number;
    maxSize: number;
    needsCleanup: boolean;
  }> {
    try {
      const dbUrl = getDatabaseUrl();
      if (dbUrl.includes("file:")) {
        const dbPath = dbUrl.replace("file:", "");
        const stats = fs.statSync(dbPath);
        const sizeInMB = stats.size / (1024 * 1024);
        const maxSizeInMB = 100; // 100MB limit

        return {
          size: sizeInMB,
          maxSize: maxSizeInMB,
          needsCleanup: sizeInMB > maxSizeInMB * 0.8, // Cleanup at 80%
        };
      }
      return { size: 0, maxSize: 100, needsCleanup: false };
    } catch (error) {
      console.error("Error checking database size:", error);
      return { size: 0, maxSize: 100, needsCleanup: true };
    }
  }

  static async emergencyCleanup(): Promise<void> {
    try {
      console.log("🚨 Starting emergency database cleanup...");

      // 1. Clean old chat messages (keep last 50 per user) - Use safer approach
      const users = await prisma.user.findMany({
        select: { user_id: true },
      });

      for (const user of users) {
        const oldMessages = await prisma.chatMessage.findMany({
          where: { user_id: user.user_id },
          orderBy: { created_at: "desc" },
          skip: 50,
          select: { message_id: true },
        });

        if (oldMessages.length > 0) {
          await prisma.chatMessage.deleteMany({
            where: {
              message_id: {
                in: oldMessages.map((m) => m.message_id),
              },
            },
          });
        }
      }

      // 2. Clean old AI recommendations (keep last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const aiCleanup = await prisma.aiRecommendation.deleteMany({
        where: {
          created_at: {
            lt: thirtyDaysAgo,
          },
        },
      });

      // 3. Clean expired sessions
      const sessionCleanup = await prisma.session.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      // 4. Clean up orphaned records
      await prisma.mealPlanSchedule.deleteMany({
        where: {
          plan: null,
        },
      });

      console.log(`✅ Emergency cleanup completed:
        - AI recommendations cleaned: ${aiCleanup.count}
        - Sessions cleaned: ${sessionCleanup.count}
        - Orphaned records cleaned`);
    } catch (error) {
      console.error("❌ Emergency cleanup failed:", error);
      throw error;
    }
  }

  static async preventiveCleanup(): Promise<void> {
    try {
      const sizeCheck = await this.checkDatabaseSize();

      if (sizeCheck.needsCleanup) {
        console.log(
          `📊 Database size: ${sizeCheck.size.toFixed(2)}MB / ${
            sizeCheck.maxSize
          }MB - Running cleanup...`
        );
        await this.emergencyCleanup();
      } else {
        console.log(
          `📊 Database size: ${sizeCheck.size.toFixed(2)}MB / ${
            sizeCheck.maxSize
          }MB - No cleanup needed`
        );
      }
    } catch (error) {
      console.error("Error in preventive cleanup:", error);
    }
  }
}

export const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    errorFormat: "pretty",
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
  });

if (process.env.NODE_ENV === "development") {
  globalThis.__prisma = prisma;
}

// Test database connection and run initial cleanup
prisma
  .$connect()
  .then(async () => {
    console.log("✅ Database connected successfully");

    // Run initial size check and cleanup if needed
    try {
      await DatabaseCleanup.preventiveCleanup();

      // Set up periodic cleanup (every 6 hours)
      setInterval(async () => {
        await DatabaseCleanup.preventiveCleanup();
      }, 6 * 60 * 60 * 1000);
    } catch (error) {
      console.error("⚠️ Initial cleanup failed:", error);
    }
  })
  .catch((error) => {
    console.error("❌ Database connection failed:", error);
  });

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
