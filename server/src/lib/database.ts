import { PrismaClient } from "@prisma/client";
import { DatabaseOptimizationService } from "../services/database/optimization";

declare global {
  var __prisma: PrismaClient | undefined;
}

// Enhanced database configuration
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return url;
};

export const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    errorFormat: "pretty",
    datasourceUrl: getDatabaseUrl(),
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
  });

if (process.env.NODE_ENV === "development") {
  globalThis.__prisma = prisma;
}

// Enhanced database connection with health monitoring
prisma
  .$connect()
  .then(async () => {
    console.log("✅ Database connected successfully");

    // Run initial health check and optimization
    try {
      const health = await DatabaseOptimizationService.checkDatabaseHealth();
      console.log("📊 Initial database health:", health);

      if (health.needsCleanup) {
        console.log("🧹 Running initial cleanup...");
        await DatabaseOptimizationService.performIntelligentCleanup();
      }

      // Optimize database on startup
      await DatabaseOptimizationService.optimizeDatabase();
      console.log("⚡ Database optimization completed");

    } catch (error) {
      console.error("⚠️ Initial database setup failed:", error);
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
