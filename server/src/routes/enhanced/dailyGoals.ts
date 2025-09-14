import { Router } from "express";
import { authenticateToken, AuthRequest } from "../../middleware/auth";
import { EnhancedDailyGoalsService } from "../../services/database/dailyGoals";
import { DatabaseOptimizationService } from "../../services/database/optimization";
import { ApiResponse } from "../../types/api";
import { prisma } from "../../lib/database";

const router = Router();

// GET /api/daily-goals - Get user's daily goals with optimization
router.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user.user_id;
    console.log("📊 Enhanced daily goals request for user:", userId);

    // Get user's daily goals
    const goals = await EnhancedDailyGoalsService.getUserDailyGoals(userId);

    const response: ApiResponse = {
      success: true,
      data: {
        ...goals,
        date: new Date().toISOString().split('T')[0]
      },
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error("Error fetching enhanced daily goals:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Failed to fetch daily goals",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// POST /api/daily-goals/generate - Manually trigger daily goals generation
router.post("/generate", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user.user_id;
    console.log("🔄 Manual daily goals generation for user:", userId);

    // Force create goals for this specific user
    const goals = await EnhancedDailyGoalsService.forceCreateDailyGoalsForUser(userId);

    const response: ApiResponse = {
      success: true,
      data: goals,
      message: "Daily goals generated successfully",
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error("Error generating daily goals:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Failed to generate daily goals",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// POST /api/daily-goals/generate-all - Generate goals for all users
router.post("/generate-all", authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log("🔄 Manual daily goals generation for ALL users");

    // Generate goals for all users
    const result = await EnhancedDailyGoalsService.createDailyGoalsForAllUsers();

    const response: ApiResponse = {
      success: true,
      data: result,
      message: `Generated goals: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error("Error generating daily goals for all users:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Failed to generate daily goals",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// POST /api/daily-goals/force-all - Force create goals for ALL users (testing)
router.post("/force-all", authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log("🚨 FORCE creating daily goals for ALL users");

    const result = await EnhancedDailyGoalsService.forceCreateGoalsForAllUsers();
    
    console.log("📊 Force creation result:", result);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: `Goals processed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error("Error force creating daily goals:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Failed to force create daily goals",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// GET /api/daily-goals/history - Get historical daily goals
router.get("/history", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user.user_id;
    const { days = 30 } = req.query;

    console.log(`📊 Getting daily goals history for user: ${userId}, days: ${days}`);

    const daysAgo = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const historicalGoals = await prisma.dailyGoal.findMany({
      where: {
        user_id: userId,
        date: {
          gte: daysAgo
        }
      },
      orderBy: {
        date: 'desc'
      }
    });

    const response: ApiResponse = {
      success: true,
      data: historicalGoals,
      message: `Retrieved ${historicalGoals.length} historical daily goals`,
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error("Error fetching daily goals history:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Failed to fetch daily goals history",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

export { router as enhancedDailyGoalsRoutes };