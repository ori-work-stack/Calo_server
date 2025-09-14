import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

// Get database URL from environment
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return url;
};

// Create Prisma client with proper configuration
export const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    errorFormat: "pretty",
  });

if (process.env.NODE_ENV === "development") {
  globalThis.__prisma = prisma;
}

// Database connection with health monitoring
prisma
  .$connect()
  .then(async () => {
    console.log("✅ Database connected successfully");

    // Run initial health check
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log("📊 Database health check passed");
    } catch (error) {
      console.error("⚠️ Database health check failed:", error);
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