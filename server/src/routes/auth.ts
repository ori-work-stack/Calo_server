import { Router } from "express";
import crypto from "crypto";
import { AuthService } from "../services/auth";
import { signUpSchema, signInSchema } from "../types/auth";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { prisma } from "../lib/database";

const router = Router();

router.post("/signup", async (req, res, next) => {
  try {
    console.log("🔄 Processing signup request...");
    console.log("📱 Request body:", { ...req.body, password: "***" });
    console.log("🌐 Origin:", req.headers.origin);
    console.log("📍 IP:", req.ip);
    console.log("🔍 User-Agent:", req.headers["user-agent"]);

    const validatedData = signUpSchema.parse(req.body);
    const result = await AuthService.signUp(validatedData);

    console.log("✅ Signup successful - email verification required");
    console.log("📧 Verification process initiated for:", validatedData.email);

    const message =
      process.env.NODE_ENV === "production"
        ? "Account created successfully! Please check your email for verification code."
        : "Account created successfully! Please check your email for verification code (or check console for development).";

    res.status(201).json({
      success: true,
      user: result.user,
      needsEmailVerification: result.needsEmailVerification,
      message: message,
    });
  } catch (error) {
    console.error("💥 Signup error:", error);

    // Enhanced error logging
    if (error instanceof Error) {
      console.error("💥 Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });

      res.status(400).json({
        success: false,
        error: error.message,
      });
    } else {
      console.error("💥 Unknown error type:", error);
      next(error);
    }
  }
});

router.post("/verify-email", async (req, res, next) => {
  try {
    console.log("🔄 Processing email verification request...");
    console.log("📧 Request body:", req.body);

    const { email, code } = req.body;

    if (!email || !code) {
      console.log("❌ Missing email or code");
      return res.status(400).json({
        success: false,
        error: "Email and verification code are required",
      });
    }

    console.log(`🔒 Verifying code ${code} for email: ${email}`);
    const result = await AuthService.verifyEmail(email, code);

    // Set secure HTTP-only cookie for web clients
    const isWebClient =
      req.headers.origin?.includes("localhost:19006") ||
      req.headers.origin?.includes("localhost:8081") ||
      req.headers["user-agent"]?.includes("Mozilla");

    if (isWebClient) {
      const cookieOptions = AuthService.getCookieOptions();
      res.cookie("auth_token", result.token, cookieOptions);
      console.log("🍪 Cookie set for web client");
    }

    console.log("✅ Email verification successful for:", email);
    console.log("👤 Updated user:", result.user);

    res.json({
      success: true,
      user: result.user,
      token: result.token,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("💥 Email verification error:", error);
    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    } else {
      next(error);
    }
  }
});

router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        email_verified: true,
        name: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        error: "Email already verified",
      });
    }

    // Generate new verification code
    const emailVerificationCode = crypto.randomInt(100000, 999999).toString();

    await prisma.user.update({
      where: { email },
      data: {
        email_verification_code: emailVerificationCode,
        email_verification_expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    // Send new verification email
    await AuthService.sendVerificationEmail(
      email,
      emailVerificationCode,
      user.name || "User"
    );

    res.json({
      success: true,
      message: "Verification code resent successfully",
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to resend verification code",
    });
  }
});

router.post("/signin", async (req, res, next) => {
  try {
    console.log("🔄 Processing signin request...");
    console.log("📱 Request body:", req.body);
    console.log("🌐 Origin:", req.headers.origin);
    console.log("📍 IP:", req.ip);
    console.log("🔍 User-Agent:", req.headers["user-agent"]);

    const validatedData = signInSchema.parse(req.body);
    const result = await AuthService.signIn(validatedData);

    // Set secure HTTP-only cookie for web clients
    const isWebClient =
      req.headers.origin?.includes("localhost:19006") ||
      req.headers.origin?.includes("localhost:8081") ||
      req.headers["user-agent"]?.includes("Mozilla");

    if (isWebClient) {
      const cookieOptions = AuthService.getCookieOptions();
      res.cookie("auth_token", result.token, cookieOptions);
      console.log("🍪 Cookie set for web client");
    } else {
      console.log(
        "📱 Mobile client detected - token will be stored in secure-store"
      );
    }

    console.log("✅ Signin successful");

    res.json({
      success: true,
      user: result.user,
      token: result.token, // Always send token for mobile compatibility
    });
  } catch (error) {
    console.error("💥 Signin error:", error);
    if (error instanceof Error) {
      res.status(401).json({
        success: false,
        error: error.message,
      });
    } else {
      next(error);
    }
  }
});

router.get("/me", authenticateToken, async (req: AuthRequest, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

router.post(
  "/signout",
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      // Get token from cookie or header
      const token =
        req.cookies.auth_token || req.headers.authorization?.substring(7);

      if (token) {
        await AuthService.signOut(token);
      }

      // Clear the cookie
      res.clearCookie("auth_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      console.log("✅ Signout successful, cookie cleared");

      res.json({
        success: true,
        message: "Signed out successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// Forgot password endpoint
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    console.log("🔄 Processing forgot password request for:", email);

    const result = await AuthService.sendPasswordResetEmail(email);

    res.json({
      success: true,
      message: "Password reset email sent successfully",
    });
  } catch (error) {
    console.error("💥 Forgot password error:", error);
    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to send password reset email",
      });
    }
  }
});

// Verify reset code endpoint
router.post("/verify-reset-code", async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: "Email and verification code are required",
      });
    }

    console.log("🔄 Verifying reset code for:", email);

    const resetToken = await AuthService.verifyResetCode(email, code);

    res.json({
      success: true,
      resetToken: resetToken,
      message: "Code verified successfully",
    });
  } catch (error) {
    console.error("💥 Reset code verification error:", error);
    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to verify reset code",
      });
    }
  }
});

// Reset password endpoint
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Token and new password are required",
      });
    }

    console.log("🔄 Processing password reset with token");

    await AuthService.resetPassword(token, newPassword);

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("💥 Reset password error:", error);
    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to reset password",
      });
    }
  }
});
export { router as authRoutes };
function next(error: unknown) {
  throw new Error("Function not implemented.");
}
