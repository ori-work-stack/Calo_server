import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../lib/database";
import { SignUpInput, SignInInput } from "../types/auth";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = "7d";
const SESSION_EXPIRES_DAYS = 7;
const PASSWORD_RESET_EXPIRES = "15m";

const userSelectFields = {
  user_id: true,
  email: true,
  name: true,
  avatar_url: true,
  subscription_type: true,
  birth_date: true,
  ai_requests_count: true,
  ai_requests_reset_at: true,
  created_at: true,
  email_verified: true,
  is_questionnaire_completed: true,
};

function generatePasswordResetToken(email: string) {
  return jwt.sign(
    {
      email,
      type: "password_reset",
      timestamp: Date.now(), // Add timestamp for extra security
    },
    JWT_SECRET,
    { expiresIn: PASSWORD_RESET_EXPIRES }
  );
}

function verifyPasswordResetToken(token: string) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      email: string;
      type: string;
      timestamp: number;
    };

    if (decoded.type !== "password_reset") {
      throw new Error("Invalid token type");
    }

    return decoded;
  } catch (error) {
    throw new Error("Invalid or expired password reset token");
  }
}

function generateToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function getSessionExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + SESSION_EXPIRES_DAYS);
  return date;
}

export class AuthService {
  static async signUp(data: SignUpInput) {
    const { email, name, password, birth_date } = data;

    const existingUser = await prisma.user.findFirst({
      where: { email },
      select: {
        email_verified: true,
        email: true,
        name: true,
      },
    });

    if (existingUser) {
      if (existingUser.email_verified) {
        throw new Error(
          "Email already registered and verified. Please sign in instead."
        );
      } else {
        // User exists but email not verified - resend verification code
        const emailVerificationCode = crypto
          .randomInt(100000, 999999)
          .toString();

        await prisma.user.update({
          where: { email },
          data: {
            email_verification_code: emailVerificationCode,
            email_verification_expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
          },
        });

        await this.sendVerificationEmail(
          email,
          emailVerificationCode,
          existingUser.name || name
        );

        return {
          user: { email, name: existingUser.name || name },
          needsEmailVerification: true,
        };
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const emailVerificationCode = crypto.randomInt(100000, 999999).toString();

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password_hash: hashedPassword,
        subscription_type: "FREE",
        birth_date: new Date(),
        ai_requests_count: 0,
        ai_requests_reset_at: new Date(),
        email_verified: false,
        email_verification_code: emailVerificationCode,
        email_verification_expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
      select: {
        ...userSelectFields,
        email_verified: true,
        email_verification_code: true,
      },
    });

    // Send verification email
    await this.sendVerificationEmail(email, emailVerificationCode, name);

    if (process.env.NODE_ENV !== "production") {
      console.log("✅ Created user:", user);
    }

    // Don't include sensitive data in response
    const { email_verification_code, ...userResponse } = user;
    return { user: userResponse, needsEmailVerification: true };
  }

  static async sendVerificationEmail(
    email: string,
    code: string,
    name: string
  ) {
    try {
      console.log("📧 Attempting to send verification email to:", email);

      // Check if email credentials are configured
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.error(
          "❌ Email credentials not configured in environment variables"
        );
        throw new Error(
          "Email service not configured. Please contact support."
        );
      }

      const nodemailer = require("nodemailer");

      const transporter = nodemailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
        tls: {
          rejectUnauthorized: false,
        },
        debug: process.env.NODE_ENV !== "production",
        logger: process.env.NODE_ENV !== "production",
      });

      // Improve email configuration debugging
      console.log("🔍 Testing email connection...");
      console.log("📧 Email config:", {
        user: process.env.EMAIL_USER,
        hasPassword: !!process.env.EMAIL_PASSWORD,
        passwordLength: process.env.EMAIL_PASSWORD?.length || 0,
      });
      await transporter.verify();
      console.log("✅ Email connection successful");

      const mailOptions = {
        from: `"Calo Fitness & Diet" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Verify Your Email Address - Calo",
        html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification - Calo</title>
      <!--[if mso]>
      <noscript>
        <xml>
          <o:OfficeDocumentSettings>
            <o:PixelsPerInch>96</o:PixelsPerInch>
          </o:OfficeDocumentSettings>
        </xml>
      </noscript>
      <![endif]-->
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa;">
        <tr>
          <td align="center" style="padding: 40px 20px;">

            <!-- Main Container -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); overflow: hidden;">

              <!-- Header Section -->
              <tr>
                <td style="background: linear-gradient(135deg, #4ECDC4 0%, #44A08D 100%); padding: 40px 32px; text-align: center;">
                  <div style="background-color: rgba(255, 255, 255, 0.1); width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; border: 3px solid rgba(255, 255, 255, 0.2);">
                    <div style="width: 40px; height: 40px; background-color: white; border-radius: 50%; position: relative;">
                      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 20px; height: 20px; background: linear-gradient(135deg, #4ECDC4 0%, #44A08D 100%); border-radius: 50%;"></div>
                    </div>
                  </div>
                  <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">Calo</h1>
                  <p style="color: rgba(255, 255, 255, 0.9); font-size: 16px; margin: 8px 0 0 0; font-weight: 400;">Fitness & Diet</p>
                </td>
              </tr>

              <!-- Content Section -->
              <tr>
                <td style="padding: 48px 32px 32px;">

                  <!-- Greeting -->
                  <h2 style="color: #1a1a1a; font-size: 24px; font-weight: 600; margin: 0 0 24px 0; line-height: 1.3;">
                    Welcome, ${name}! 👋
                  </h2>

                  <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 32px 0;">
                    Thank you for joining Calo! We're excited to help you on your fitness and nutrition journey. Please verify your email address using the code below.
                  </p>

                  <!-- Verification Code Container -->
                  <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border: 2px dashed #cbd5e0; border-radius: 12px; padding: 32px; text-align: center; margin: 32px 0;">
                    <p style="color: #4a5568; font-size: 14px; margin: 0 0 16px 0; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">
                      Verification Code
                    </p>
                    <div style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; color: #2d3748; letter-spacing: 8px; margin: 16px 0; text-align: center;">
                      ${code}
                    </div>
                    <p style="color: #718096; font-size: 13px; margin: 16px 0 0 0;">
                      This code expires in <strong>15 minutes</strong>
                    </p>
                  </div>

                  <!-- Instructions -->
                  <div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 20px; margin: 32px 0; border-radius: 0 8px 8px 0;">
                    <h3 style="color: #1e40af; font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">
                      📱 What's next?
                    </h3>
                    <p style="color: #1e40af; font-size: 14px; line-height: 1.5; margin: 0;">
                      Enter this code in the Calo app to verify your email and unlock all features including personalized meal plans, workout tracking, and progress analytics.
                    </p>
                  </div>

                  <!-- Security Notice -->
                  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 32px 0; border-radius: 0 8px 8px 0;">
                    <h3 style="color: #dc2626; font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">
                      🔒 Security Notice
                    </h3>
                    <p style="color: #dc2626; font-size: 14px; line-height: 1.5; margin: 0;">
                      If you didn't create an account with Calo, please ignore this email. Never share your verification code with anyone.
                    </p>
                  </div>

                </td>
              </tr>

              <!-- Footer Section -->
              <tr>
                <td style="background-color: #f8f9fa; padding: 32px; text-align: center; border-top: 1px solid #e2e8f0;">

                  <!-- Social Links -->
                  <div style="margin-bottom: 24px;">
                    <a href="#" style="display: inline-block; margin: 0 8px; width: 40px; height: 40px; background-color: #4ECDC4; border-radius: 50%; text-decoration: none; line-height: 40px; color: white; font-size: 16px;">📧</a>
                    <a href="#" style="display: inline-block; margin: 0 8px; width: 40px; height: 40px; background-color: #4ECDC4; border-radius: 50%; text-decoration: none; line-height: 40px; color: white; font-size: 16px;">💬</a>
                    <a href="#" style="display: inline-block; margin: 0 8px; width: 40px; height: 40px; background-color: #4ECDC4; border-radius: 50%; text-decoration: none; line-height: 40px; color: white; font-size: 16px;">🌐</a>
                  </div>

                  <!-- Company Info -->
                  <p style="color: #1a1a1a; font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">
                    Calo - Fitness & Diet
                  </p>
                  <p style="color: #718096; font-size: 14px; margin: 0 0 16px 0; line-height: 1.5;">
                    Your Personal Nutrition & Fitness Assistant<br>
                    Transform your health, one meal at a time.
                  </p>

                  <!-- Links -->
                  <div style="margin: 24px 0;">
                    <a href="#" style="color: #4ECDC4; text-decoration: none; font-size: 14px; margin: 0 16px; font-weight: 500;">Privacy Policy</a>
                    <a href="#" style="color: #4ECDC4; text-decoration: none; font-size: 14px; margin: 0 16px; font-weight: 500;">Terms of Service</a>
                    <a href="#" style="color: #4ECDC4; text-decoration: none; font-size: 14px; margin: 0 16px; font-weight: 500;">Support</a>
                  </div>

                  <!-- Copyright -->
                  <p style="color: #a0aec0; font-size: 12px; margin: 20px 0 0 0;">
                    © 2025 Calo. All rights reserved.<br>
                    <a href="#" style="color: #a0aec0; text-decoration: none;">Unsubscribe</a> | 
                    <a href="#" style="color: #a0aec0; text-decoration: none;">Update Preferences</a>
                  </p>

                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>
    </body>
    </html>
  `,
      };

      const result = await transporter.sendMail(mailOptions);
      console.log(`✅ Verification email sent to ${email}`);
      console.log("📧 Message ID:", result.messageId);

      // Still log to console for development
      if (process.env.NODE_ENV !== "production") {
        console.log(`📧 Verification email for ${email}`);
        console.log(`👤 Name: ${name}`);
        console.log(`🔑 Verification Code: ${code}`);
        console.log(`⏰ Code expires in 15 minutes`);
      }

      return true;
    } catch (error: any) {
      console.error("❌ Failed to send verification email:", error);

      // More detailed error logging
      if (error.code === "EAUTH") {
        console.error(
          "🔐 Authentication failed - check your email credentials"
        );
        console.error(
          "💡 Make sure you're using an App Password for Gmail, not your regular password"
        );
      } else if (error.code === "ECONNECTION") {
        console.error("🌐 Connection failed - check your internet connection");
      } else if (error.code === "ESOCKET") {
        console.error("🔌 Socket error - check network connectivity");
      } else {
        console.error("🚨 Unknown email error:", error.message);
      }

      // Fallback to console logging for development
      console.log(`📧 FALLBACK - Verification email for ${email}`);
      console.log(`👤 Name: ${name}`);
      console.log(`🔑 Verification Code: ${code}`);
      console.log(`⏰ Code expires in 15 minutes`);
      console.log(`⚠️ Please check server console for verification code`);

      // For production, we should throw the error so signup knows email failed
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "Failed to send verification email. Please try again or contact support."
        );
      }

      // In development, continue without throwing error
      return true;
    }
  }

  static async verifyEmail(email: string, code: string) {
    console.log(`🔒 Verifying email ${email} with code ${code}`);

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        ...userSelectFields,
        email_verified: true,
        email_verification_code: true,
        email_verification_expires: true,
      },
    });

    if (!user) {
      console.log(`❌ User not found: ${email}`);
      throw new Error("User not found");
    }

    console.log("🔍 User found:", {
      email: user.email,
      email_verified: user.email_verified,
      has_code: !!user.email_verification_code,
      code_expires: user.email_verification_expires,
    });

    if (user.email_verified) {
      console.log(`⚠️ Email already verified: ${email}`);
      throw new Error("Email already verified");
    }

    if (
      !user.email_verification_expires ||
      user.email_verification_expires < new Date()
    ) {
      console.log(`❌ Verification code expired for: ${email}`);
      throw new Error("Verification code expired");
    }

    if (user.email_verification_code !== code) {
      console.log(
        `❌ Invalid verification code. Expected: ${user.email_verification_code}, Got: ${code}`
      );
      throw new Error("Invalid verification code");
    }

    console.log(`✅ Code verified, updating user: ${email}`);

    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        email_verified: true,
        email_verification_code: null,
        email_verification_expires: null,
      },
      select: userSelectFields,
    });

    console.log("✅ User updated:", updatedUser);

    const token = generateToken({
      user_id: updatedUser.user_id,
      email: updatedUser.email,
    });

    await prisma.session.create({
      data: {
        user_id: updatedUser.user_id,
        token,
        expiresAt: getSessionExpiryDate(),
      },
    });

    console.log(`✅ Session created for user: ${email}`);

    return { user: updatedUser, token };
  }

  static async signIn(data: SignInInput) {
    const { email, password } = data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("Invalid email or password");

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) throw new Error("Invalid email or password");

    const token = generateToken({ user_id: user.user_id, email: user.email });

    await prisma.session.create({
      data: {
        user_id: user.user_id,
        token,
        expiresAt: getSessionExpiryDate(),
      },
    });

    const { password_hash: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
  }

  static async verifyToken(token: string) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        user_id: string;
        email: string;
      };

      if (
        !decoded ||
        typeof decoded !== "object" ||
        !("user_id" in decoded) ||
        !("email" in decoded)
      ) {
        throw new Error("Invalid token payload");
      }

      const session = await prisma.session.findUnique({
        where: { token },
        include: {
          user: { select: userSelectFields },
        },
      });

      if (!session || session.expiresAt < new Date()) {
        throw new Error("Session expired");
      }

      return session.user;
    } catch {
      throw new Error("Invalid token");
    }
  }

  static async signOut(token: string) {
    await prisma.session.deleteMany({ where: { token } });
  }
  static async sendPasswordResetEmail(email: string): Promise<void> {
    console.log("🔄 Sending password reset email to:", email);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Generate reset code (same as email verification)
    const resetCode = crypto.randomInt(100000, 999999).toString();
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes (same as email verification)

    // Store reset code in database temporarily
    await prisma.user.update({
      where: { email },
      data: {
        password_reset_code: resetCode,
        password_reset_expires: resetExpires,
      },
    });

    // Send password reset email
    await this.sendPasswordResetEmailTemplate(
      email,
      resetCode,
      user.name || "User"
    );

    console.log("✅ Password reset code generated and sent");
  }

  static async sendPasswordResetEmailTemplate(
    email: string,
    code: string,
    name: string
  ) {
    try {
      const nodemailer = require("nodemailer");

      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
        tls: {
          rejectUnauthorized: false,
        },
        debug: process.env.NODE_ENV !== "production",
        logger: process.env.NODE_ENV !== "production",
      });

      // Test the connection
      console.log("🔍 Testing email connection...");
      await transporter.verify();
      console.log("✅ Email connection verified");

      const mailOptions = {
        from: `"Calo Fitness & Diet" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Password Reset Code - Calo",
        html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset - Calo</title>
      <!--[if mso]>
      <noscript>
        <xml>
          <o:OfficeDocumentSettings>
            <o:PixelsPerInch>96</o:PixelsPerInch>
          </o:OfficeDocumentSettings>
        </xml>
      </noscript>
      <![endif]-->
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa;">
        <tr>
          <td align="center" style="padding: 40px 20px;">

            <!-- Main Container -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); overflow: hidden;">

              <!-- Header Section -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 32px; text-align: center; position: relative;">
                  <!-- Background Pattern -->
                  <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: radial-gradient(circle at 20% 50%, rgba(255, 255, 255, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%); opacity: 0.5;"></div>

                  <!-- Logo/Icon -->
                  <div style="background-color: rgba(255, 255, 255, 0.15); width: 90px; height: 90px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; border: 3px solid rgba(255, 255, 255, 0.3); position: relative;">
                    <div style="width: 50px; height: 50px; background-color: white; border-radius: 50%; position: relative;">
                      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 24px; height: 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%;"></div>
                      <div style="position: absolute; top: 15px; left: 15px; width: 8px; height: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 2px; transform: rotate(45deg);"></div>
                    </div>
                  </div>

                  <h1 style="color: #ffffff; font-size: 32px; font-weight: 700; margin: 0; letter-spacing: -0.5px; position: relative;">Calo</h1>
                  <p style="color: rgba(255, 255, 255, 0.9); font-size: 16px; margin: 8px 0 0 0; font-weight: 400; position: relative;">Password Reset</p>
                </td>
              </tr>

              <!-- Content Section -->
              <tr>
                <td style="padding: 48px 32px 32px;">

                  <!-- Greeting -->
                  <div style="text-align: center; margin-bottom: 32px;">
                    <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                      <span style="color: white; font-size: 24px;">🔑</span>
                    </div>
                    <h2 style="color: #1a1a1a; font-size: 26px; font-weight: 600; margin: 0 0 8px 0; line-height: 1.3;">
                      Reset Your Password
                    </h2>
                    <p style="color: #4a5568; font-size: 16px; margin: 0;">
                      Hello <strong>${name}</strong>! We received a request to reset your password.
                    </p>
                  </div>

                  <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 32px 0; text-align: center;">
                    Enter the verification code below in the Calo app to create a new password for your account.
                  </p>

                  <!-- Verification Code Container -->
                  <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border: 2px solid #e2e8f0; border-radius: 16px; padding: 40px 32px; text-align: center; margin: 32px 0; position: relative; overflow: hidden;">
                    <!-- Background decoration -->
                    <div style="position: absolute; top: -50px; right: -50px; width: 100px; height: 100px; background: linear-gradient(135deg, #667eea20 0%, #764ba220 100%); border-radius: 50%; opacity: 0.5;"></div>
                    <div style="position: absolute; bottom: -30px; left: -30px; width: 60px; height: 60px; background: linear-gradient(135deg, #667eea20 0%, #764ba220 100%); border-radius: 50%; opacity: 0.3;"></div>

                    <p style="color: #4a5568; font-size: 14px; margin: 0 0 20px 0; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; position: relative;">
                      Your Reset Code
                    </p>

                    <!-- Code Display -->
                    <div style="background-color: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 20px 0; position: relative;">
                      <div style="font-family: 'Courier New', monospace; font-size: 42px; font-weight: 700; color: #2d3748; letter-spacing: 10px; margin: 0; text-align: center; line-height: 1;">
                        ${code}
                      </div>
                    </div>

                    <div style="display: flex; align-items: center; justify-content: center; margin-top: 20px; position: relative;">
                      <div style="width: 20px; height: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; margin-right: 8px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-size: 12px;">⏰</span>
                      </div>
                      <p style="color: #718096; font-size: 14px; margin: 0; font-weight: 500;">
                        This code expires in <strong style="color: #4a5568;">15 minutes</strong>
                      </p>
                    </div>
                  </div>

                  <!-- Instructions -->
                  <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-left: 4px solid #3b82f6; padding: 24px; margin: 32px 0; border-radius: 0 12px 12px 0; position: relative;">
                    <div style="position: absolute; top: 20px; right: 20px; width: 30px; height: 30px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                      <span style="color: white; font-size: 14px;">📱</span>
                    </div>
                    <h3 style="color: #1e40af; font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">
                      How to use this code:
                    </h3>
                    <ul style="color: #1e40af; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
                      <li>Open the Calo app on your device</li>
                      <li>Enter this 6-digit code when prompted</li>
                      <li>Create your new secure password</li>
                      <li>Start using your account immediately</li>
                    </ul>
                  </div>

                  <!-- Security Notice -->
                  <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-left: 4px solid #ef4444; padding: 24px; margin: 32px 0; border-radius: 0 12px 12px 0; position: relative;">
                    <div style="position: absolute; top: 20px; right: 20px; width: 30px; height: 30px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                      <span style="color: white; font-size: 14px;">🔒</span>
                    </div>
                    <h3 style="color: #dc2626; font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">
                      Security Notice
                    </h3>
                    <p style="color: #dc2626; font-size: 14px; line-height: 1.5; margin: 0;">
                      <strong>Important:</strong> If you didn't request this password reset, please ignore this email and contact our support team. Never share your reset code with anyone.
                    </p>
                  </div>

                </td>
              </tr>

              <!-- Footer Section -->
              <tr>
                <td style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 32px; text-align: center; border-top: 1px solid #e2e8f0;">

                  <!-- Social Links -->
                  <div style="margin-bottom: 24px;">
                    <a href="#" style="display: inline-block; margin: 0 8px; width: 44px; height: 44px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; text-decoration: none; line-height: 44px; color: white; font-size: 16px; transition: transform 0.2s;">📧</a>
                    <a href="#" style="display: inline-block; margin: 0 8px; width: 44px; height: 44px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; text-decoration: none; line-height: 44px; color: white; font-size: 16px; transition: transform 0.2s;">💬</a>
                    <a href="#" style="display: inline-block; margin: 0 8px; width: 44px; height: 44px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; text-decoration: none; line-height: 44px; color: white; font-size: 16px; transition: transform 0.2s;">🌐</a>
                  </div>

                  <!-- Company Info -->
                  <div style="background-color: white; border-radius: 12px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);">
                    <h3 style="color: #1a1a1a; font-size: 18px; font-weight: 600; margin: 0 0 8px 0;">
                      Calo - Fitness & Diet
                    </h3>
                    <p style="color: #718096; font-size: 14px; margin: 0 0 16px 0; line-height: 1.5;">
                      Your Personal Nutrition & Fitness Assistant<br>
                      <strong style="color: #4a5568;">Transform your health, one meal at a time.</strong>
                    </p>

                    <!-- App Download Buttons -->
                    <div style="margin: 16px 0;">
                      <span style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 500; margin: 0 4px;">📱 Available on iOS & Android</span>
                    </div>
                  </div>

                  <!-- Links -->
                  <div style="margin: 24px 0;">
                    <a href="#" style="color: #667eea; text-decoration: none; font-size: 14px; margin: 0 16px; font-weight: 500; padding: 8px 12px; border-radius: 6px; background-color: rgba(102, 126, 234, 0.1);">Privacy Policy</a>
                    <a href="#" style="color: #667eea; text-decoration: none; font-size: 14px; margin: 0 16px; font-weight: 500; padding: 8px 12px; border-radius: 6px; background-color: rgba(102, 126, 234, 0.1);">Terms of Service</a>
                    <a href="#" style="color: #667eea; text-decoration: none; font-size: 14px; margin: 0 16px; font-weight: 500; padding: 8px 12px; border-radius: 6px; background-color: rgba(102, 126, 234, 0.1);">Support</a>
                  </div>

                  <!-- Copyright -->
                  <p style="color: #a0aec0; font-size: 12px; margin: 20px 0 0 0; line-height: 1.5;">
                    © 2025 Calo. All rights reserved.<br>
                    <a href="#" style="color: #a0aec0; text-decoration: none;">Unsubscribe</a> | 
                    <a href="#" style="color: #a0aec0; text-decoration: none;">Update Preferences</a>
                  </p>

                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>
    </body>
    </html>
  `,
      };

      const result = await transporter.sendMail(mailOptions);
      console.log(`✅ Password reset email sent to ${email}`);
      console.log("📧 Message ID:", result.messageId);

      // Fallback to console logging for development
      if (process.env.NODE_ENV !== "production") {
        console.log(`📧 Password reset email for ${email}`);
        console.log(`👤 Name: ${name}`);
        console.log(`🔑 Reset Code: ${code}`);
        console.log(`⏰ Code expires in 15 minutes`);
      }

      return true;
    } catch (error: any) {
      console.error("❌ Failed to send password reset email:", error);

      // Fallback to console logging if email fails
      console.log(`📧 FALLBACK - Password reset code for ${email}`);
      console.log(`👤 Name: ${name}`);
      console.log(`🔑 Reset Code: ${code}`);
      console.log(`⏰ Code expires in 15 minutes`);

      // Don't throw error - let the process continue even if email fails
      return true;
    }
  }

  static async verifyResetCode(email: string, code: string): Promise<string> {
    console.log("🔒 Verifying reset code for:", email);

    if (!code || code.trim() === "") {
      throw new Error("Reset code is required");
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (!user.password_reset_code || !user.password_reset_expires) {
      throw new Error("No reset code found");
    }

    if (user.password_reset_code !== code.trim()) {
      throw new Error("Invalid reset code");
    }

    if (new Date() > user.password_reset_expires) {
      throw new Error("Reset code has expired");
    }

    // Generate simple reset token (like email verification)
    const resetToken = jwt.sign(
      { userId: user.user_id, email: user.email, type: "password_reset" },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    console.log("✅ Reset code verified, token generated");
    return resetToken;
  }

  static async resetPassword(
    token: string,
    newPassword: string
  ): Promise<void> {
    console.log("🔑 Resetting password with token");

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      if (decoded.type !== "password_reset") {
        throw new Error("Invalid reset token");
      }

      const user = await prisma.user.findUnique({
        where: { email: decoded.email },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password and clear reset fields (like email verification clears verification fields)
      await prisma.user.update({
        where: { email: decoded.email },
        data: {
          password_hash: hashedPassword,
          password_reset_code: null,
          password_reset_expires: null,
        },
      });

      // Invalidate all existing sessions for security
      await prisma.session.deleteMany({
        where: { user_id: user.user_id },
      });

      console.log("✅ Password reset successfully for:", decoded.email);
    } catch (error) {
      console.error("💥 Password reset error:", error);
      throw new Error("Invalid or expired reset token");
    }
  }

  // Add method to verify token validity (for frontend validation)
  static async verifyPasswordResetToken(token: string) {
    try {
      const decoded = verifyPasswordResetToken(token);

      // Optional: Check if user still exists
      const user = await prisma.user.findUnique({
        where: { email: decoded.email },
        select: { email: true, email_verified: true },
      });

      if (!user || !user.email_verified) {
        throw new Error("User not found or email not verified");
      }

      return { valid: true, email: decoded.email };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Invalid token",
      };
    }
  }
  static async getRolePermissions(role: string) {
    const permissions = {
      FREE: { dailyRequests: 10 },
      PREMIUM: { dailyRequests: 50 },
      GOLD: { dailyRequests: -1 },
    };

    return permissions[role as keyof typeof permissions] ?? permissions.FREE;
  }

  static getCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: SESSION_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
      path: "/",
    };
  }
}
