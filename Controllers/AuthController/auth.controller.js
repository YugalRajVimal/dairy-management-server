import sendMail from "../../config/nodeMailer.config.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import UserModel from "../../Schema/user.schema.js";
import ExpiredTokenModel from "../../Schema/expired-token.schema.js";

class AuthController {
  // ✅ Check Authorization
  checkAuth = async (req, res) => {
    try {
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
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
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

      const user = await UserModel.findOne({ email, role }).lean();
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // ✅ Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // ✅ Save OTP with expiry (10 minutes)
      await UserModel.findByIdAndUpdate(
        user._id,
        {
          otp:"000000",
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min expiry
        },
        { new: true }
      );

      // ✅ Send OTP via mail (async, don't block request)
      // sendMail(email, "Your OTP Code", `Your OTP is: ${otp}`).catch(
      //   console.error
      // );

      return res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) {
      console.error("Signin Error:", error);
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
