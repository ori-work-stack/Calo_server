import { Router } from "express";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { DailyGoalsService } from "../services/dailyGoal";
import { prisma } from "../lib/database";

const router = Router();

// GET /api/daily-goals - Get user's daily goals
router.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user.user_id;
    
    console.log("📊 Getting daily goals for user:", userId);
    
    // First check if goals exist for today
    const today = new Date().toISOString().split('T')[0];
    const existingGoals = await prisma.dailyGoal.findFirst({
      where: {
        user_id: userId,
        date: new Date(today)
      }
    });
    
    let goals;
    if (existingGoals) {
      console.log("✅ Found existing daily goals for today");
      goals = {
        calories: Number(existingGoals.calories),
        protein_g: Number(existingGoals.protein_g),
        carbs_g: Number(existingGoals.carbs_g),
        fats_g: Number(existingGoals.fats_g),
        fiber_g: Number(existingGoals.fiber_g),
        sodium_mg: Number(existingGoals.sodium_mg),
        sugar_g: Number(existingGoals.sugar_g),
        water_ml: Number(existingGoals.water_ml)
      };
    } else {
      console.log("📊 No goals found for today, creating new ones");
      goals = await DailyGoalsService.createOrUpdateDailyGoals(userId);
    }

    res.json({
      success: true,
      data: goals,
    });
  } catch (error) {
    console.error("Error fetching daily goals:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch daily goals",
    });
  }
});

// PUT /api/daily-goals - Update user's daily goals
router.put("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user.user_id;
    
    console.log("🔄 Force creating daily goals for user:", userId);
    
    // Use the enhanced service to force create goals
    const { EnhancedDailyGoalsService } = await import("../services/database/dailyGoals");
    const goals = await EnhancedDailyGoalsService.forceCreateDailyGoalsForUser(userId);

    res.json({
      success: true,
      data: goals,
    });
  } catch (error) {
    console.error("Error updating daily goals:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update daily goals",
    });
  }
});

export { router as dailyGoalsRoutes };
