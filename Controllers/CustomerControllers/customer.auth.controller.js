import UserModel from "../../Schema/user.schema.js";
import sendMail from "../../config/nodeMailer.config.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { deleteUploadedFiles } from "../../middlewares/fileDelete.middleware.js";
import SubscriptionModel from "../../Schema/subscriptions.schema.js";
import ExpiredTokenModel from "../../Schema/expired-token.schema.js";
import PackageModel from "../../Schema/packages.schema.js";

class SubAdminAuthController {
  checkAuth = async (req, res) => {
    try {
      console.log("Not Verified");

      if (req.user.role != "Customer") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      console.log("Verified");
      return res.status(200).json({ message: "Authorized" });
    } catch (error) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  };

  signup = async (req, res) => {
    const { email, name, phoneNo } = req.body;
    console.log(`[Signup] Attempting signup for email: ${email}`);

    if (!email || !name || !phoneNo) {
      console.log("[Signup] Missing required fields.");
      return res.status(400).json({ message: "All fields are required" });
    }

    try {
      const existingUser = await UserModel.findOne({ email });
      console.log(`[Signup] Checked for existing user with email: ${email}`);

      if (existingUser) {
        return res
          .status(409)
          .json({ message: "Email already in use. Please login." });
      }

      const newUser = new UserModel({
        email,
        name,
        phoneNo,
        role: "Customer",
      });

      await newUser.save();
      console.log(`[Signup] New user ${newUser.id} saved successfully.`);

      // Generate a random 6 digit OTP
      const otp = Math.floor(Math.random() * 900000) + 100000;
      // Save OTP to the user document and set an expiration time
      await UserModel.findByIdAndUpdate(
        newUser.id,
        { otp, otpExpires: new Date(Date.now() + 10 * 60 * 1000) },
        { new: true }
      );
      console.log(
        `[Signup] OTP ${otp} generated and saved for new user ${newUser.id}.`
      );

      // Send OTP to the user's email
      const message = `Your OTP is: ${otp}`;
      await sendMail(email, "Sign Up OTP", message);
      console.log(`[Signup] OTP email sent to ${email}.`);

      res.status(201).json({
        message: "Sign Up successful. OTP sent to your email. Verify Account",
      });
      console.log(`[Signup] Signup successful for ${email}. Response sent.`);
    } catch (error) {
      console.error(`[Signup] Error during signup for ${email}:`, error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  verifyAccount = async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }
    try {
      const user = await UserModel.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (user.otp !== otp) {
        return res.status(401).json({ message: "Invalid OTP" });
      }
      user.otp = null;
      user.save();
      // Verify the user and update the verified field to true
      // Generate a JSON Web Token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: "Customer" },
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
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    try {
      const user = await UserModel.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Generate a random 6 digit OTP
      const otp = Math.floor(Math.random() * 900000) + 100000;
      // Save OTP to the user document and set an expiration time
      await UserModel.findByIdAndUpdate(
        user.id,
        { otp, otpExpires: new Date(Date.now() + 10 * 60 * 1000) },
        { new: true }
      );

      // Send OTP to the user's email
      const message = `Your OTP is: ${otp}`;
      await sendMail(email, "Sign Up OTP", message);
      console.log(`[Signup] OTP email sent to ${email}.`);

      res.status(200).json({ message: "OTP sent to mail successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getRegistrationDetails = async (req, res) => {
    try {
      const { id } = req.user; // Assuming req.user is populated by a JWT middleware

      if (!id) {
        return res.status(400).json({ message: "User ID is required." });
      }

      const user = await UserModel.findById(id).select("documents"); // Select only the documents field

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      if (
        !user.documents ||
        Object.values(user.documents).every((doc) => !doc)
      ) {
        return res
          .status(404)
          .json({ message: "No registration documents found for this user." });
      }

      res.status(200).json({
        message: "Customer registration documents retrieved successfully",
        documents: user.documents,
      });
    } catch (error) {
      console.error("Error fetching registration details:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  registration = async (req, res) => {
    try {
      const { id, email } = req.user;

      // Validate required fields from authenticated user
      if (!id || !email) {
        deleteUploadedFiles(req.files); // cleanup on failure
        return res.status(400).json({
          message: "User ID and Email are required for registration.",
        });
      }

      const existingUser = await UserModel.findOne({ _id: id, email });

      if (!existingUser) {
        deleteUploadedFiles(req.files);
        return res
          .status(404) // Changed status from 409 to 404 as the user was not found.
          .json({ message: "User not found with the provided ID and email." });
      }

      if (
        !req.files ||
        (!req.files.aadhar?.length &&
          !req.files.drivingLicense?.length &&
          !req.files.addressProof?.length)
      ) {
        deleteUploadedFiles(req.files);
        return res.status(400).json({
          message:
            "At least one registration document (Aadhar, Driving License, or Address Proof) is required.",
        });
      }

      // Extract uploaded file paths safely
      const documents = {
        aadharFilePath: req.files?.aadhar ? req.files.aadhar[0].path : null,
        drivingLicenseFilePath: req.files?.drivingLicense
          ? req.files.drivingLicense[0].path
          : null,
        addressProofFilePath: req.files?.addressProof
          ? req.files.addressProof[0].path
          : null,
      };

      // Update the documents field on the user object
      existingUser.documents = documents;
      // Save the updated user document to the database
      await existingUser.save();

      res
        .status(200) // Changed status from 201 to 200 as this is an update operation, not a creation.
        .json({
          message: "Customer documents registered successfully",
          user: existingUser, // The existingUser object now reflects the saved changes.
        });
    } catch (error) {
      console.error("Registration error:", error);

      // Cleanup uploaded files if an error occurs during processing
      deleteUploadedFiles(req.files);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  updateProfileDetails = async (req, res) => {
    // Assuming 'UserModel' is imported and 'deleteSingleFile' utility function is available in scope.
    // 'deleteSingleFile' should handle deleting a single file path, similar to how 'deleteUploadedFiles'
    // handles multiple files in the 'registration' method.
    try {
      const userId = req.user.id; // Assuming jwtAuth middleware sets req.userId
      const { name } = req.body;
      const profilePictureFile = req.file; // Assuming 'upload.single('profilePicture')' middleware is used on the route

      if (!userId) {
        return res
          .status(401)
          .json({ message: "Unauthorized: User ID not found." });
      }

      const existingUser = await UserModel.findById(userId);

      if (!existingUser) {
        // If a file was uploaded but user not found, delete the file
        if (profilePictureFile) {
          // Assuming deleteSingleFile is available (e.g., imported or defined globally)
          deleteSingleFile(profilePictureFile.path);
        }
        return res.status(404).json({ message: "User not found." });
      }

      let updated = false;

      // Update name if provided and different from current name
      // Check for undefined, null, and empty string after trimming
      if (
        name !== undefined &&
        name !== null &&
        name.trim() !== "" &&
        existingUser.name !== name
      ) {
        existingUser.name = name;
        updated = true;
      }

      // Update profile picture if a new one is uploaded
      if (profilePictureFile) {
        // Ensure documents object exists on the user
        if (!existingUser.documents) {
          existingUser.documents = {};
        }

        // If an old profile picture path exists, delete the old file
        if (existingUser.documents.profilePictureFilePath) {
          // Assuming deleteSingleFile is available
          deleteSingleFile(existingUser.documents.profilePictureFilePath);
        }

        // Set the new profile picture file path
        existingUser.documents.profilePictureFilePath = profilePictureFile.path;
        updated = true;
      }

      if (!updated) {
        // If no name was updated and no new profile picture was provided,
        // return a 400 Bad Request.
        // No file deletion needed here as 'profilePictureFile' would not have been processed as an update
        // (i.e., if profilePictureFile was present, 'updated' would have been true).
        return res
          .status(400)
          .json({ message: "No valid profile details provided for update." });
      }

      await existingUser.save();

      // Respond with updated user details, excluding sensitive info
      res.status(200).json({
        message: "Profile details updated successfully",
        user: {
          _id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          phoneNo: existingUser.phoneNo,
          role: existingUser.role,
          // Include the updated profile picture path if it exists
          profilePictureFilePath:
            existingUser.documents?.profilePictureFilePath || null,
        },
      });
    } catch (error) {
      console.error("Update profile details error:", error);
      // If a file was uploaded and an error occurred during processing, delete it
      if (req.file) {
        // Assuming deleteSingleFile is available
        deleteSingleFile(req.file.path);
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getProfileDetails = async (req, res) => {
    try {
      const userId = req.user.id; // Get user ID from the authenticated request

      const user = await UserModel.findById(userId).select(
        "name email phoneNo documents.profilePictureFilePath wallet createdAt"
      );

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      res.status(200).json({
        message: "Profile details fetched successfully",
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phoneNo: user.phoneNo,
          wallet: user.wallet,
          createdAt: user.createdAt,
          profilePictureFilePath:
            user.documents?.profilePictureFilePath || null,
        },
      });
    } catch (error) {
      console.error("Get profile details error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getAllPackages = async (req, res) => {
    // NOTE: PackageModel needs to be imported at the top of this file for this function to work correctly.
    // Example: import PackageModel from "../../Schema/packages.schema.js";
    try {
      const packages = await PackageModel.find({}); // Fetch all packages from the database

      if (!packages || packages.length === 0) {
        return res.status(404).json({ message: "No packages found." });
      }

      return res.status(200).json({
        message: "Packages fetched successfully",
        packages: packages,
      });
    } catch (error) {
      console.error("Error fetching packages:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  purchasePackage = async (req, res) => {
    try {
      const userId = req.user.id; // Get user ID from the authenticated request

      // Extract subscription details from the request body
      const { planName, period, amount, daysCount, paymentFrom } = req.body;

      // Basic validation for required fields
      if (!planName || !period || !amount || !paymentFrom) {
        return res.status(400).json({
          message:
            "Missing required subscription details (planName, period, amount).",
        });
      }

      if (period == "payAsYouGo" && !daysCount) {
        return res.status(400).json({
          message: "For 'payAsYouGo' plans, 'daysCount' is required.",
        });
      }

      // Validate amount type and value
      if (typeof amount !== "number" || amount <= 0) {
        return res
          .status(400)
          .json({ message: "Amount must be a positive number." });
      }

      // Find the user and update their subscription arrays
      const user = await UserModel.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      // Set subscription start date to now
      const subscriptionStartsOn = new Date();
      let trialEndsOn = new Date(subscriptionStartsOn); // Initialize with start date

      if (period === "monthly") {
        trialEndsOn.setDate(subscriptionStartsOn.getDate() + 30);
      } else if (period === "weekly") {
        trialEndsOn.setDate(subscriptionStartsOn.getDate() + 7);
      } else if (period === "payAsYouGo") {
        trialEndsOn.setDate(subscriptionStartsOn.getDate() + daysCount);
      }

      if (paymentFrom != "Wallet" || paymentFrom != "PaymentGateway") {
        return res.status(400).json({
          message:
            "Invalid paymentFrom method. Must be 'Wallet' or 'PaymentGateway'",
        });
      }

      if (paymentFrom == "Wallet") {
        if (user.walletBalance < amount) {
          return res
            .status(402)
            .json({ message: "Insufficient wallet balance." });
        }

        user.walletBalance =
          parseFloat(user.walletBalance) - parseFloat(amount);

        user.walletHistory.push({
          amount: amount,
          type: "Debit",
        });
      }

      // Create a new subscription document
      const newSubscription = new SubscriptionModel({
        planName,
        period,
        trialEndsOn,
        subscriptionStartsOn,
        amount,
        paymentFrom,
        daysCount: daysCount ? daysCount : null,
      });

      // Save the new subscription to the database
      await newSubscription.save();

      user.currentSubscriptions.push(newSubscription._id);
      user.subscriptionHistory.push(newSubscription._id); // Also add to history

      // Add transaction history for the purchase
      user.transactionHistory.push({
        amount: amount,
        type: "Debit",
        debittedFrom: paymentFrom, // Assuming payment is made via an external gateway for the subscription
        transactionDate: new Date(),
      });

      await user.save();

      // Respond with success
      res.status(201).json({
        message: "Subscription package purchased successfully.",
        subscription: newSubscription,
      });
    } catch (error) {
      console.error("Purchase package error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getSubscriptionDetail = async (req, res) => {
    try {
      const userId = req.user.id; // Assuming userId is available from JWT middleware
      const { subscriptionId } = req.params; // Assuming subscription ID comes from URL parameters

      if (!subscriptionId) {
        return res
          .status(400)
          .json({ message: "Subscription ID is required." });
      }

      // Find the user to ensure the subscription belongs to them
      const user = await UserModel.findById(userId)
        .populate("currentSubscriptions")
        .populate("subscriptionHistory");

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      // Check if the requested subscription ID exists in either current or historical subscriptions for this user
      const isUsersSubscription =
        user.currentSubscriptions.some(
          (sub) => sub._id.toString() === subscriptionId
        ) ||
        user.subscriptionHistory.some(
          (sub) => sub._id.toString() === subscriptionId
        );

      if (!isUsersSubscription) {
        return res
          .status(404)
          .json({ message: "Subscription not found for this user." });
      }

      // Fetch the full subscription details
      const subscription = await SubscriptionModel.findById(subscriptionId);

      if (!subscription) {
        // This case should ideally not be hit if isUsersSubscription is true, but good for robustness
        return res
          .status(404)
          .json({ message: "Subscription details not found." });
      }

      res.status(200).json({ subscription });
    } catch (error) {
      console.error("Get specific subscription details error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getAllSubscriptionDetails = async (req, res) => {
    try {
      const userId = req.user.id; // Assuming userId is available from JWT middleware

      // Find the user and populate their current subscriptions
      const user = await UserModel.findById(userId).populate(
        "currentSubscriptions"
      );

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      res
        .status(200)
        .json({ currentSubscriptions: user.currentSubscriptions || [] });
    } catch (error) {
      console.error("Get all current subscriptions error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getSubscriptionHistory = async (req, res) => {
    try {
      const userId = req.user.id; // Assuming userId is available from JWT middleware

      // Find the user and populate their subscription history
      const user = await UserModel.findById(userId).populate(
        "subscriptionHistory"
      );

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      res
        .status(200)
        .json({ subscriptionHistory: user.subscriptionHistory || [] });
    } catch (error) {
      console.error("Get subscription history error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getWalletDetails = async (req, res) => {
    try {
      const userId = req.user.id; // Assuming userId is available from JWT middleware

      const user = await UserModel.findById(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      res.status(200).json({ walletBalance: user.walletBalance || 0 }); // Assuming 'wallet' field exists in UserModel
    } catch (error) {
      console.error("Get wallet details error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  addAmountToWallet = async (req, res) => {
    try {
      const userId = req.user.id; // Assuming userId is available from JWT middleware
      const { amount } = req.body;

      if (!amount || typeof amount !== "number" || amount <= 0) {
        return res
          .status(400)
          .json({ message: "Valid positive amount is required." });
      }

      const user = await UserModel.findById(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      user.walletBalance += amount;
      user.totalAddedBalanceInWallet += amount;
      user.walletHistory.push({
        amount: amount,
        type: "Credit",
      });

      await user.save();

      res.status(200).json({
        message: "Amount added to wallet successfully.",
        newWalletBalance: user.walletBalance,
      });
    } catch (error) {
      console.error("Add amount to wallet error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getWalletHistory = async (req, res) => {
    try {
      const userId = req.user.id; // Get user ID from the authenticated request

      const user = await UserModel.findById(userId).select("walletHistory");

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      res.status(200).json({
        message: "Wallet history fetched successfully.",
        walletHistory: user.walletHistory,
      });
    } catch (error) {
      console.error("Get wallet history error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getTransactionHistory = async (req, res) => {
    try {
      const userId = req.user.id; // Get user ID from the authenticated request

      const user = await UserModel.findById(userId).select(
        "transactionHistory"
      );

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      res.status(200).json({
        message: "Transaction history fetched successfully.",
        transactionHistory: user.transactionHistory,
      });
    } catch (error) {
      console.error("Get transaction history error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  logout = async (req, res) => {
    try {
      const { token } = req.body; // Assuming the token is sent in the request body

      if (!token) {
        return res
          .status(400)
          .json({ message: "Token is required for logout." });
      }

      // Check if the token is already expired (optional, but good for idempotency)
      const existingExpiredToken = await ExpiredTokenModel.findOne({ token });
      if (existingExpiredToken) {
        return res
          .status(200)
          .json({ message: "User already logged out successfully." });
      }

      // Add the token to the ExpiredTokenModel
      const expiredToken = new ExpiredTokenModel({ token });
      await expiredToken.save();

      res.status(200).json({ message: "Logged out successfully." });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  pushNotification = async (req, res) => {};
}

export default SubAdminAuthController;
