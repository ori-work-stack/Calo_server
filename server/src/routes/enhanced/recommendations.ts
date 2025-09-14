import { Router } from "express";
import { authenticateToken, AuthRequest } from "../../middleware/auth";
import { EnhancedAIRecommendationService } from "../../services/database/aiRecommendations";
import { DatabaseOptimizationService } from "../../services/database/optimization";
import { ApiResponse } from "../../types/api";
import { prisma } from "../../lib/database";

const router = Router();

// GET /api/recommendations - Get user's AI recommendations
router.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user.user_id;
    const { limit = 7 } = req.query;

    console.log("🤖 Enhanced recommendations request for user:", userId);

    const recommendations = await EnhancedAIRecommendationService.getUserRecommendations(
      userId,
      Number(limit)
    );

    const response: ApiResponse = {
      success: true,
      data: recommendations,
      message: `Retrieved ${recommendations.length} recommendations`,
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error("Error fetching enhanced recommendations:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Failed to fetch recommendations",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// POST /api/recommendations/generate - Manually trigger recommendation generation
router.post("/generate", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user.user_id;
    console.log("🔄 Manual recommendation generation for user:", userId);

    // Check for duplicates first
    const today = new Date().toISOString().split('T')[0];
    const duplicateCheck = await DatabaseOptimizationService.checkForDuplicates(userId, today);

    if (duplicateCheck.hasRecommendation) {
      const response: ApiResponse = {
        success: true,
        data: null,
        message: "Recommendation already exists for today",
        timestamp: new Date().toISOString()
      };
      return res.json(response);
    }

    // Generate new recommendation
    const result = await EnhancedAIRecommendationService.generateRecommendationsForAllUsers();

    const response: ApiResponse = {
      success: true,
      data: result,
      message: "Recommendations generated successfully",
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error("Error generating recommendations:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Failed to generate recommendations",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// PUT /api/recommendations/:id/read - Mark recommendation as read
router.put("/:id/read", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;

    console.log("👁️ Marking recommendation as read:", id);

    await prisma.aiRecommendation.updateMany({
      where: {
        id: id,
        user_id: userId
      },
      data: {
        is_read: true,
        updated_at: new Date()
      }
    });

    const response: ApiResponse = {
      success: true,
      message: "Recommendation marked as read",
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error("Error marking recommendation as read:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Failed to mark recommendation as read",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// GET /api/recommendations/today - Get today's recommendation
router.get("/today", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user.user_id;
    const today = new Date().toISOString().split('T')[0];

    console.log("📅 Getting today's recommendation for user:", userId);

    const todayRecommendation = await prisma.aiRecommendation.findFirst({
      where: {
        user_id: userId,
        date: today
      }
    });

    if (!todayRecommendation) {
      // Try to generate one if it doesn't exist
      const generated = await EnhancedAIRecommendationService.generateRecommendationsForAllUsers();
      
      if (generated.created > 0) {
        // Fetch the newly created recommendation
        const newRecommendation = await prisma.aiRecommendation.findFirst({
          where: {
            user_id: userId,
            date: today
          }
        });

        const response: ApiResponse = {
          success: true,
          data: newRecommendation,
          message: "Generated new recommendation for today",
          timestamp: new Date().toISOString()
        };

        return res.json(response);
      }
    }

    const response: ApiResponse = {
      success: true,
      data: todayRecommendation,
      message: todayRecommendation ? "Today's recommendation found" : "No recommendation available for today",
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error("Error fetching today's recommendation:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Failed to fetch today's recommendation",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

export { router as enhancedRecommendationsRoutes };