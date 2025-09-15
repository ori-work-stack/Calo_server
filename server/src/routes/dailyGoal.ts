import { Router } from "express";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { EnhancedDailyGoalsService } from "../services/database/dailyGoals";
import { prisma } from "../lib/database";

const router = Router();

// GET /api/daily-goals - Get user's daily goals (CREATE IF MISSING)
router.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user.user_id;
    
    console.log("📊 === DAILY GOALS GET REQUEST ===");
    console.log("📊 User ID:", userId);
    
    // Use enhanced service to get goals (creates if missing)
    const goals = await EnhancedDailyGoalsService.getUserDailyGoals(userId);
    
    console.log("📊 Retrieved/Created goals:", goals);

    res.json({
      success: true,
      data: goals,
      message: "Daily goals retrieved successfully"
    });
  } catch (error) {
    console.error("💥 Error fetching daily goals:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch daily goals",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// PUT /api/daily-goals - Force create daily goals for current user
router.put("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user.user_id;
    
    console.log("🔄 === FORCE CREATING DAILY GOALS ===");
    console.log("🔄 User ID:", userId);
    
    // Force create goals for this specific user
    const goals = await EnhancedDailyGoalsService.forceCreateDailyGoalsForUser(userId);
    
    console.log("✅ Force created goals:", goals);

    res.json({
      success: true,
      data: goals,
      message: "Daily goals created successfully"
    });
  } catch (error) {
    console.error("💥 Error creating daily goals:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create daily goals",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// POST /api/daily-goals/create-all - Create goals for ALL users (admin/testing)
router.post("/create-all", authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log("🚨 === CREATING DAILY GOALS FOR ALL USERS ===");
    
    // Use force creation to ensure goals are created
    const result = await EnhancedDailyGoalsService.forceCreateGoalsForAllUsers();
    
    console.log("📊 Creation result:", result);

    res.json({
      success: true,
      data: result,
      message: `Goals processed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
    });
  } catch (error) {
    console.error("💥 Error creating daily goals for all users:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create daily goals for all users",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// GET /api/daily-goals/verify - Verify daily goals exist in database
router.get("/verify", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user.user_id;
    
    console.log("🔍 === VERIFYING DAILY GOALS AND DATABASE STATE ===");
    console.log("🔍 User ID:", userId);
    
    // Use debug method to get complete database state
    const debugInfo = await EnhancedDailyGoalsService.debugDatabaseState();
    
    // Get user-specific goals
    const userGoals = await EnhancedDailyGoalsService.getUserDailyGoals(userId);

    res.json({
      success: true,
      data: {
        userGoals,
        debugInfo,
        userId
      },
      message: "Daily goals verification and debug completed"
    });
  } catch (error) {
    console.error("💥 Error verifying daily goals:", error);
    res.status(500).json({
      success: false,
      error: "Failed to verify daily goals",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// POST /api/daily-goals/force-single - Force create goal for single user (testing)
router.post("/force-single", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user.user_id;
    
    console.log("🔄 === FORCE CREATING SINGLE USER GOAL ===");
    console.log("🔄 User ID:", userId);
    
    // Use simple creation method
    const success = await EnhancedDailyGoalsService.createDailyGoalForUser(userId);
    
    if (success) {
      // Get the created goal
      const goals = await EnhancedDailyGoalsService.getUserDailyGoals(userId);
      
      res.json({
        success: true,
        data: goals,
        message: "Daily goal created successfully for single user"
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to create daily goal for user"
      });
    }
  } catch (error) {
    console.error("💥 Error creating single user goal:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create daily goal",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export { router as dailyGoalsRoutes };