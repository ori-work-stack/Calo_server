import { Router } from "express";
import { authenticateToken, AuthRequest } from "../../middleware/auth";
import { DatabaseOptimizationService } from "../../services/database/optimization";
import { EnhancedCronJobService } from "../../services/cron/enhanced";
import { ApiResponse } from "../../types/api";

const router = Router();

// GET /api/database/health - Check database health
router.get("/health", authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log("🔍 Database health check requested");

    const health = await DatabaseOptimizationService.checkDatabaseHealth();

    const response: ApiResponse = {
      success: true,
      data: health,
      message: `Database status: ${health.status}`,
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error("Error checking database health:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Failed to check database health",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// POST /api/database/cleanup - Trigger database cleanup
router.post("/cleanup", authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Only allow admin users to trigger cleanup
    if (req.user.subscription_type !== 'GOLD') {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions for database cleanup"
      });
    }

    console.log("🧹 Manual database cleanup triggered by user:", req.user.user_id);

    const cleanupResult = await DatabaseOptimizationService.performIntelligentCleanup();

    const response: ApiResponse = {
      success: true,
      data: cleanupResult,
      message: `Cleanup completed: ${cleanupResult.deletedRecords} records deleted`,
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error("Error performing database cleanup:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Failed to perform database cleanup",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// POST /api/database/optimize - Trigger database optimization
router.post("/optimize", authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Only allow admin users to trigger optimization
    if (req.user.subscription_type !== 'GOLD') {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions for database optimization"
      });
    }

    console.log("⚡ Manual database optimization triggered by user:", req.user.user_id);

    await DatabaseOptimizationService.optimizeDatabase();

    const response: ApiResponse = {
      success: true,
      message: "Database optimization completed successfully",
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error("Error optimizing database:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Failed to optimize database",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// GET /api/database/cron-status - Get cron job status
router.get("/cron-status", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const status = EnhancedCronJobService.getJobStatus();

    const response: ApiResponse = {
      success: true,
      data: status,
      message: "Cron job status retrieved",
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error("Error getting cron status:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Failed to get cron status",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// POST /api/database/emergency-recovery - Emergency database recovery
router.post("/emergency-recovery", authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Only allow admin users to trigger emergency recovery
    if (req.user.subscription_type !== 'GOLD') {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions for emergency recovery"
      });
    }

    console.log("🚨 Emergency database recovery triggered by user:", req.user.user_id);

    const recovered = await DatabaseOptimizationService.emergencyRecovery();

    const response: ApiResponse = {
      success: recovered,
      data: { recovered },
      message: recovered ? "Emergency recovery completed successfully" : "Emergency recovery failed",
      timestamp: new Date().toISOString()
    };

    res.status(recovered ? 200 : 500).json(response);

  } catch (error) {
    console.error("Error in emergency recovery:", error);
    
    const errorResponse: ApiResponse = {
      success: false,
      error: "Emergency recovery failed",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

export { router as enhancedDatabaseRoutes };