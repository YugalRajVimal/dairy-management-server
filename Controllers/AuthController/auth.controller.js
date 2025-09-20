import sendMail from "../../config/nodeMailer.config.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import UserModel from "../../Schema/user.schema.js";
import ExpiredTokenModel from "../../Schema/expired-token.schema.js";

class AuthController {
  checkAuth = async (req, res) => {
    try {
      return res.status(200).json({ message: "Authorized" });
    } catch (error) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  };

  verifyAccount = async (req, res) => {
    const { email, otp, role } = req.body;
    if (!email || !otp || !role) {
      return res
        .status(400)
        .json({ message: "Email, OTP and Role are required" });
    }
    try {
      const user = await UserModel.findOne({ email, role });
      if (!user) {
        return res.status(404).json({ message: "Admin not found" });
      }

      if (user.otp !== otp) {
        return res.status(401).json({ message: "Invalid OTP" });
      }

      user.otp = null;
      user.save();

      // Generate a JSON Web Token
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: role,
          vendorId: user.vendorId ? user.vendorId : null,
        },
        process.env.JWT_SECRET
        // { expiresIn: "24h" }
      );
      res.status(200).json({ message: "Account verified successfully", token });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  signin = async (req, res) => {
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ message: "Email and role are required" });
    }
    try {
      const user = await UserModel.findOne({ email, role });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const otp = Math.floor(Math.random() * 900000) + 100000;
      // Save OTP to the admin document
      await UserModel.findByIdAndUpdate(user.id, { otp }, { new: true });

      const message = `Your OTP is: ${otp}`;
      await sendMail(email, "Sign Up OTP", message);

      // Generate a JSON Web Token
      // const token = jwt.sign(
      //   { id: user.id, email: user.email, role: role },
      //   process.env.JWT_SECRET
      //   // { expiresIn: "24h" }
      // );
      res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
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
