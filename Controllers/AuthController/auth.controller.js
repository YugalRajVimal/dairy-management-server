import sendMail from "../../config/nodeMailer.config.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import UserModel from "../../Schema/user.schema.js";
import ExpiredTokenModel from "../../Schema/expired-token.schema.js";
import Maintenance from "../../Schema/maintenance.schema.js";

class AuthController {
  // ✅ Check Authorization
  // ✅ Check Authorization
  checkAuth = async (req, res) => {
    try {
      const { role } = req.user || {};

      console.log(role);

      if (role !== 'Admin' && role !== 'Supervisor' &&  role !== 'Vendor') {

        const maintenanceStatus = await Maintenance.findOne({});

        console.log("-------", maintenanceStatus.isMaintenanceMode);

        if (maintenanceStatus && maintenanceStatus.isMaintenanceMode) {
          return res.status(423).json({
            message: "The application is under maintenance. Please try again later.",
          });
        }
      }

   

      return res.status(200).json({ message: "Authorized" });
    } catch (error) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  };

  // ✅ Verify Account with OTP
  verifyAccount = async (req, res) => {
    try {
      let { email, otp, role } = req.body;

      if (!email || !otp || !role) {
        return res
          .status(400)
          .json({ message: "Email, OTP, and Role are required" });
      }

      email = email.trim().toLowerCase();
      role = role.trim();

      // Atomic find + verify OTP + clear OTP
      const user = await UserModel.findOneAndUpdate(
        { email, role, otp }, // ensure OTP matches
        { $unset: { otp: 1 }, lastLogin: new Date() },
        { new: true }
      ).lean();

      if (!user) {
        return res.status(401).json({ message: "Invalid credentials or OTP" });
      }

      // ✅ Generate JWT
      const token = jwt.sign(
        {
          id: user._id,
          email: user.email,
          role: user.role,
          vendorId: user.vendorId || null,
          supervisorId: user.supervisorId || null,
        },
        process.env.JWT_SECRET
      );

      return res
        .status(200)
        .json({ message: "Account verified successfully", token });
    } catch (error) {
      console.error("VerifyAccount Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  // ✅ Sign In → Send OTP
  signin = async (req, res) => {
    try {
      let { email, role } = req.body;

      if (!email || !role) {
        return res.status(400).json({ message: "Email and role are required" });
      }

      email = email.trim().toLowerCase();
      role = role.trim();

      // Find user and load OTP fields too
      const user = await UserModel.findOne({ email, role });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const now = new Date();

      // Initialize otpAttempts/otpSentTime fields if not set
      if (!user.otpAttempts) user.otpAttempts = 0;
      if (!user.otpSentTime) user.otpSentTime = null;

      // If sent too many times (5+), check if enough time passed (15min)
      if (user.otpAttempts >= 5) {
        if (user.otpSentTime && now - user.otpSentTime < 15 * 60 * 1000) {
          // Still under lockout
          return res.status(429).json({ message: "OTP limit exceeded. Try again after 15 minutes." });
        } else {
          // Reset attempts after 15 min
          user.otpAttempts = 0;
        }
      }

      // If sent within 1 minute, do not allow resend
      if (user.otpSentTime && now - user.otpSentTime < 60 * 1000) {
        return res.status(429).json({ message: "OTP has been sent recently. Please wait 1 minute before trying again." });
      }

      // ✅ Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Update user with new OTP, attempts, sent time, expiry
      user.otp = otp;
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      user.otpSentTime = now;
      user.otpExpiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 min expiry

      await user.save();

      // ✅ Send OTP via mail (async, don't block request)
      sendMail(email, "Your OTP Code", `Your OTP is: ${otp}`).catch(console.error);

      return res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) {
      console.error("Signin Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  vendorSupervisorSignin = async (req, res) => {
    try {
      let { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email and role are required" });
      }

      email = email.trim().toLowerCase();

      const user = await UserModel.findOne({ email }).lean();
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const role = user.role;

      if (role === "SubAdmin" || role === "Admin") {
        return res.status(403).json({ message: "Invalid Mail" });
      }

      // If user is a Vendor and is disabled
      if (role === "Vendor" && user.disabled === true) {
        return res.status(403).json({ message: "This Vendor account is disabled. Please contact support." });
      }

      // ✅ Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // ✅ Save OTP with expiry (10 minutes)
      await UserModel.findByIdAndUpdate(
        user._id,
        {
          otp: "000000",
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min expiry
        },
        { new: true }
      );

      // ✅ Send OTP via mail (async, don't block request)
      // sendMail(email, "Your OTP Code", `Your OTP is: ${otp}`).catch(
      //   console.error
      // );

      return res
        .status(200)
        .json({ message: "OTP sent successfully", role: role });
    } catch (error) {
      console.error("Signin Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  vendorSupervisorVerifyAccount = async (req, res) => {
    try {
      let { email, otp } = req.body;

      if (!email || !otp) {
        return res.status(400).json({ message: "Email, OTP, are required" });
      }

      email = email.trim().toLowerCase();

      // Atomic find + verify OTP + clear OTP
      const user = await UserModel.findOneAndUpdate(
        { email, otp }, // ensure OTP matches
        { $unset: { otp: 1 }, lastLogin: new Date() },
        { new: true }
      ).lean();

      if (!user) {
        return res.status(401).json({ message: "Invalid credentials or OTP" });
      }

      // ✅ Generate JWT
      const token = jwt.sign(
        {
          id: user._id,
          email: user.email,
          role: user.role,
          vendorId: user.vendorId || null,
          supervisorId: user.supervisorId || null,
        },
        process.env.JWT_SECRET
      );

      return res
        .status(200)
        .json({
          message: "Account verified successfully",
          token,
          role: user.role,
        });
    } catch (error) {
      console.error("VerifyAccount Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  // logout = async (req, res) => {
  //   try {
  //     const { token } = req.body; // Assuming the token is sent in the request body

  //     if (!token) {
  //       return res
  //         .status(400)
  //         .json({ message: "Token is required for logout." });
  //     }

  //     // Check if the token is already expired (optional, but good for idempotency)
  //     const existingExpiredToken = await ExpiredTokenModel.findOne({ token });
  //     if (existingExpiredToken) {
  //       return res
  //         .status(200)
  //         .json({ message: "User already logged out successfully." });
  //     }

  //     // Add the token to the ExpiredTokenModel
  //     const expiredToken = new ExpiredTokenModel({ token });
  //     await expiredToken.save();

  //     res.status(200).json({ message: "Logged out successfully." });
  //   } catch (error) {
  //     console.error("Logout error:", error);
  //     res.status(500).json({ message: "Internal Server Error" });
  //   }
  // };
}

export default AuthController;
