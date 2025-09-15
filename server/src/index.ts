  import express from "express";
  import cors from "cors";
  import helmet from "helmet";
  import cookieParser from "cookie-parser";
  import compression from "compression";
  import rateLimit from "express-rate-limit";
  import dotenv from "dotenv";
  import { PrismaClient } from "@prisma/client";
  import { Server } from "http"; // Add this import
  import { errorHandler } from "./middleware/errorHandler";
  import { authRoutes } from "./routes/auth";
  import { nutritionRoutes } from "./routes/nutrition";
  import { userRoutes } from "./routes/user";
  import { questionnaireRoutes } from "./routes/questionnaire";
  import chatRoutes from "./routes/chat";
  import { deviceRoutes } from "./routes/devices";
  import { mealPlansRoutes } from "./routes/mealPlans";
  import recommendedMenuRoutes  from "./routes/recommendedMenu";
  import { calendarRoutes } from "./routes/calendar";
  import statisticsRoutes from "./routes/statistics";
  import foodScannerRoutes from "./routes/foodScanner";
  import { EnhancedCronJobService } from "./services/cron/enhanced";
  import { UserCleanupService } from "./services/userCleanup";
  import { enhancedDailyGoalsRoutes } from "./routes/enhanced/dailyGoals";
  import { enhancedRecommendationsRoutes } from "./routes/enhanced/recommendations";
  import { enhancedDatabaseRoutes } from "./routes/enhanced/database";
 import { dailyGoalsRoutes } from "./routes/dailyGoal";
  import achievementsRouter from "./routes/achievements";
  import shoppingListRoutes from "./routes/shoppingLists";
  import mealCompletionRouter from "./routes/mealCompletion";
  
  // Load environment variables
  dotenv.config();
  
  // Initialize Prisma Client
  const prisma = new PrismaClient();
  
  // Declare server variable
  let server: Server;
  
  // Configuration
  const config = {
    port: Number(process.env.PORT) || 5000,
    nodeEnv: process.env.NODE_ENV || "development",
    apiBaseUrl: process.env.API_BASE_URL,
    clientUrl: process.env.CLIENT_URL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    isDevelopment: process.env.NODE_ENV !== "production",
    serverIp: process.env.API_BASE_URL
      ? process.env.API_BASE_URL.replace(/\/api$/, "")
          .split("//")[1]
          ?.split(":")[0]
      : "localhost", // Extract IP from API_BASE_URL or default to localhost
  };
  
  // Derived configuration
  const apiOrigin = config.apiBaseUrl?.replace(/\/api$/, "");
  
  // Logging helper
  const log = {
    info: (message: any, ...args: any) => console.log(`ℹ️  ${message}`, ...args),
    warn: (message: any, ...args: any) => console.log(`⚠️  ${message}`, ...args),
    success: (message: any, ...args: any) =>
      console.log(`✅ ${message}`, ...args),
    error: (message: any, ...args: any) => console.log(`❌ ${message}`, ...args),
    rocket: (message: any, ...args: any) => console.log(`🚀 ${message}`, ...args),
  };
  
  // Initialize Express app
  const app = express();
  
  // Trust proxy for accurate IP addresses
  app.set("trust proxy", 1);
  
  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: config.isDevelopment ? false : undefined,
      crossOriginEmbedderPolicy: false,
    })
  );
  
  // Compression middleware
  app.use(compression());
  
  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: config.isDevelopment ? 1000 : 100, // requests per window
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);
  
  // CORS configuration
  const corsOptions = {
    origin: [
      config.clientUrl,
      "http://localhost:19006",
      "http://localhost:19000",
      apiOrigin || `http://${config.serverIp}:19006`,
      apiOrigin || `http://${config.serverIp}:8081`,
      ...(config.isDevelopment ? ["*"] : []),
    ].filter(Boolean) as string[],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  };
  
  app.use(cors(corsOptions));
  
  // Body parsing middleware
  app.use(cookieParser());
  app.use(
    express.json({
      limit: "10mb",
      type: ["application/json", "text/plain"],
    })
  );
  app.use(
    express.urlencoded({
      extended: true,
      limit: "10mb",
    })
  );
  
  // Health check endpoint
  app.get("/health", async (req, res) => {
    try {
      // Test database connection
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        status: "ok",
        environment: config.nodeEnv,
        database: "connected",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "unknown",
        uptime: process.uptime(),
        openai_enabled: !!config.openaiApiKey,
      });
    } catch (error) {
      log.error("Database connection check failed:", error);
      res.status(500).json({
        status: "error",
        environment: config.nodeEnv,
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "unknown",
        uptime: process.uptime(),
        openai_enabled: !!config.openaiApiKey,
      });
    }
  });
  
  // Test endpoint
  app.get("/test", (req, res) => {
    log.info("Test endpoint accessed from:", req.ip);
    res.json({
      message: "Server is reachable!",
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      origin: req.headers.origin,
      openai_enabled: !!config.openaiApiKey,
    });
  });
  
  // API routes with prefix
  const apiRouter = express.Router();
  apiRouter.use("/auth", authRoutes);
  apiRouter.use("/questionnaire", questionnaireRoutes);
  apiRouter.use("/nutrition", nutritionRoutes);
  apiRouter.use("/recommended-menus", recommendedMenuRoutes);
  apiRouter.use("/user", userRoutes);
  apiRouter.use("/devices", deviceRoutes);
  apiRouter.use("/calendar", calendarRoutes);
  apiRouter.use("/meal-plans", mealPlansRoutes);
  apiRouter.use("/chat", chatRoutes);
  apiRouter.use("/food-scanner", foodScannerRoutes);
  apiRouter.use("/shopping-lists", shoppingListRoutes);
  apiRouter.use("/", statisticsRoutes);
  apiRouter.use("/daily-goals", enhancedDailyGoalsRoutes);
  apiRouter.use("/recommendations", enhancedRecommendationsRoutes);
  apiRouter.use("/database", enhancedDatabaseRoutes);
 apiRouter.use("/daily-goals-simple", dailyGoalsRoutes);
  apiRouter.use("/", achievementsRouter);
  apiRouter.use("/meal-completions", mealCompletionRouter);
  
  // Add a test endpoint to manually trigger daily goals creation
  apiRouter.post("/test/create-daily-goals", async (req, res) => {
    try {
      console.log("🧪 TEST ENDPOINT: Creating daily goals for all users");
     
     // Get total users first
     const totalUsers = await prisma.user.count();
     console.log(`👥 TOTAL USERS IN DATABASE: ${totalUsers}`);
     
     // Get total goals for today
     const today = new Date().toISOString().split('T')[0];
     const todayDate = new Date(today + 'T00:00:00.000Z');
     const totalTodayGoals = await prisma.dailyGoal.count({
       where: { 
         date: {
           gte: todayDate,
           lt: new Date(todayDate.getTime() + 24 * 60 * 60 * 1000)
         }
       }
     });
     console.log(`📊 EXISTING GOALS FOR TODAY: ${totalTodayGoals}`);
     
     // List all users
     const allUsers = await prisma.user.findMany({
       select: {
         user_id: true,
         email: true,
         subscription_type: true
       }
     });
     
     console.log("👥 ALL USERS:");
     allUsers.forEach((user, index) => {
       console.log(`  ${index + 1}. ${user.user_id} (${user.email}) - ${user.subscription_type}`);
     });
     
     // Force create goals for ALL users
     console.log("🚨 FORCE creating goals for ALL users...");
     const { EnhancedDailyGoalsService } = await import("./services/database/dailyGoals");
     const result = await EnhancedDailyGoalsService.forceCreateGoalsForAllUsers();
      
      console.log("📊 Final test result:", result);
     
     // Final verification
     const finalTodayGoals = await prisma.dailyGoal.count({
       where: { 
         date: {
           gte: todayDate,
           lt: new Date(todayDate.getTime() + 24 * 60 * 60 * 1000)
         }
       }
     });
     console.log(`📊 FINAL GOALS COUNT FOR TODAY: ${finalTodayGoals}`);
     
     // List all goals created today
     const todayGoals = await prisma.dailyGoal.findMany({
       where: { 
         date: {
           gte: todayDate,
           lt: new Date(todayDate.getTime() + 24 * 60 * 60 * 1000)
         }
       },
       select: {
         id: true,
         user_id: true,
         calories: true,
         created_at: true
       }
     });
     
     console.log("📋 ALL GOALS CREATED TODAY:");
     todayGoals.forEach((goal, index) => {
       console.log(`  ${index + 1}. ID: ${goal.id}, User: ${goal.user_id}, Calories: ${goal.calories}`);
     });
      
      res.json({
        success: true,
        message: `Test completed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`,
        data: {
          ...result,
          totalUsers,
          initialTodayGoals: totalTodayGoals,
          finalTodayGoals: finalTodayGoals,
          allUsers: allUsers.map(u => ({ user_id: u.user_id, email: u.email })),
          todayGoals: todayGoals
        }
      });
    } catch (error) {
      console.error("💥 Test endpoint error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Add simple test endpoint for single user goal creation
  apiRouter.post("/test/create-single-goal", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = req.user.user_id;
      console.log("🧪 TEST: Creating daily goal for single user:", userId);
      
      const { EnhancedDailyGoalsService } = await import("./services/database/dailyGoals");
      const success = await EnhancedDailyGoalsService.createDailyGoalForUser(userId);
      
      if (success) {
        const goals = await EnhancedDailyGoalsService.getUserDailyGoals(userId);
        res.json({
          success: true,
          data: goals,
          message: "Daily goal created successfully for current user"
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Failed to create daily goal"
        });
      }
    } catch (error) {
      console.error("💥 Single goal test error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  app.use("/api", apiRouter);
  
  // 404 handler for undefined routes
  app.use("*", (req, res) => {
    res.status(404).json({
      error: "Route not found",
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  });
  
  // Error handler (must be last)
  app.use(errorHandler);
  
  // Startup logging
  const logStartup = () => {
    log.rocket("Starting server...");
    log.info(`Environment: ${config.nodeEnv}`);
    log.info(`Port: ${config.port}`);
    log.info(`API Base URL: ${config.apiBaseUrl || "Not set"}`);
  
    if (config.openaiApiKey) {
      log.success("OpenAI API key found - AI features enabled");
    } else {
      log.warn("No OpenAI API key found. AI features will use mock data.");
      log.info("To enable AI features, set OPENAI_API_KEY in your .env file");
    }
  };
  
  // Graceful shutdown
  const gracefulShutdown = (signal: string) => {
    log.info(`Received ${signal}, shutting down gracefully...`);
  
    if (server) {
      server.close(async () => {
        log.info("Server closed successfully");
        await prisma.$disconnect();
        log.info("Database disconnected");
        process.exit(0);
      });
    } else {
      // If server is not initialized yet, just disconnect from database and exit
      prisma.$disconnect().then(() => {
        log.info("Database disconnected");
        process.exit(0);
      });
    }
  };
  
  // Start server
  async function startServer() {
    try {
      // Test database connection
      await prisma.$connect();
      log.success("Database connection successful");
  
      // Store the server instance
      server = app.listen(config.port, "0.0.0.0", () => {
        logStartup();
        log.rocket(`Server running on port ${config.port}`);
        log.info(`Database: Supabase PostgreSQL`);
        log.info(`Environment: ${config.nodeEnv}`);
        log.info(`Access from phone: http://${config.serverIp}:${config.port}`);
        log.success("Cookie-based authentication enabled");
        log.info(`Test endpoint: http://${config.serverIp}:${config.port}/test`);
        log.info(`Health check: http://${config.serverIp}:${config.port}/health`);
  
        if (!config.openaiApiKey) {
          log.warn(
            "Note: AI features are using mock data. Add OPENAI_API_KEY to enable real AI analysis."
          );
        }
        
        // Initialize enhanced cron jobs
        EnhancedCronJobService.initializeEnhancedCronJobs();
        UserCleanupService.initializeCleanupJobs();
      });
    } catch (error) {
      log.error("❌ Database connection failed:", error);
      log.error(
        "Please check your DATABASE_URL in .env file and ensure the database is running."
      );
      process.exit(1);
    }
  }
  
  startServer();
  
  // Handle process termination
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  
  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    log.error("Uncaught Exception:", error);
    // Attempt graceful shutdown before exiting
    gracefulShutdown("uncaughtException");
  });
  
  process.on("unhandledRejection", (reason, promise) => {
    log.error("Unhandled Rejection at:", promise, "reason:", reason);
    // Attempt graceful shutdown before exiting
    gracefulShutdown("unhandledRejection");
  });
  
  export default app;
