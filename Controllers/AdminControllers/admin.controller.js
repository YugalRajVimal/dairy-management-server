import sendMail from "../../config/nodeMailer.config.js";
import UserModel from "../../Schema/user.schema.js";

class AdminController {
  onboardSubAdmin = async (req, res) => {
    if (req.user.role != "Admin") {
      return res
        .status(403)
        .json({
          message: "Unauthorized: Only Admins can perform this action.",
        });
    }

    let {
      name,
      nickName,
      email,
      phoneNumber,
      addressLine,
      city,
      state,
      pincode,
    } = req.body;

    // Trim string fields and convert email to lowercase
    if (typeof name === "string") name = name.trim();
    if (typeof nickName === "string") nickName = nickName.trim();
    if (typeof email === "string") email = email.trim().toLowerCase(); // Convert email to lowercase
    if (typeof phoneNumber === "string") phoneNumber = phoneNumber.trim();
    if (typeof addressLine === "string") addressLine = addressLine.trim();
    if (typeof city === "string") city = city.trim();
    if (typeof state === "string") state = state.trim();
    if (typeof pincode === "string") pincode = pincode.trim();

    // Validate presence and type for all fields
    if (
      !name ||
      typeof name !== "string" ||
      !nickName ||
      typeof nickName !== "string" ||
      !email ||
      typeof email !== "string" ||
      !phoneNumber ||
      typeof phoneNumber !== "string" ||
      !addressLine ||
      typeof addressLine !== "string" ||
      !city ||
      typeof city !== "string" ||
      !state ||
      typeof state !== "string" ||
      !pincode ||
      typeof pincode !== "string"
    ) {
      return res
        .status(400)
        .json({
          message: "All fields are required and must be valid strings.",
        });
    }

    // More specific field validations
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format." });
    }

    // Phone number validation (e.g., 10 digits, numeric)
      // Phone number validation (e.g., 10 digits, numeric)
      const phoneRegex = /^(\+\d{1,4}\s*)?\d{10}$/; // Allows an optional country code (e.g., +1, +91) followed by 10 digits
      if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({
          message:
            "Invalid phone number format. Must be 10 digits, optionally preceded by a country code (e.g., +1 1234567890 or 1234567890).",
        });
      }

    // Pincode validation (e.g., 6 digits, numeric)
    const pincodeRegex = /^\d{6}$/; // Assuming 6-digit pincodes
    if (!pincodeRegex.test(pincode)) {
      return res
        .status(400)
        .json({ message: "Invalid pincode format. Must be 6 digits." });
    }

    try {
      // Check if a sub-admin with this email already exists
      const existingSubAdmin = await UserModel.findOne({
        email, // Use the lowercase email for lookup
        role: "SubAdmin",
      });

      if (existingSubAdmin) {
        return res
          .status(409)
          .json({ message: "Sub-admin with this email already exists." });
      }

      // Generate a 6-digit OTP for the new sub-admin
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // OTP valid for 10 minutes

      // Create a new sub-admin instance
      const newSubAdmin = new UserModel({
        name,
        nickName,
        email, // Use the lowercase email
        phoneNo: phoneNumber, // Use phoneNo as per user.schema.js
        role: "SubAdmin", // Assign a default role
        otp,
        otpExpires,
        address: {
          addressLine,
          city,
          state,
          pincode,
        },
      });

      // Save the new sub-admin to the database
      await newSubAdmin.save();

      // Send the OTP to the sub-admin's email
      const mailSubject =
        "Welcome to ABC Company - Verify Your Sub-Admin Account";
      const mailMessage = `Dear ${name},\n\nYour sub-admin account has been created. Please use your email to log into your account and log in:\n\nRegards,\nABC Company Team`;
      await sendMail(email, mailSubject, mailMessage); // Use the lowercase email

      // Respond with success message and sub-admin details
      res.status(201).json({
        message:
          "Sub-admin onboarded successfully. OTP sent to email for verification.",
        subAdmin: {
          id: newSubAdmin._id,
          name: newSubAdmin.name,
          email: newSubAdmin.email,
          phoneNo: newSubAdmin.phoneNo,
          role: newSubAdmin.role,
          address: newSubAdmin.address,
        },
      });
    } catch (error) {
      console.error("Error onboarding sub-admin:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getAllSubAdmins = async (req, res) => {
    if (req.user.role !== "Admin") {
      return res.status(403).json({
        message: "Unauthorized: Only Admins can perform this action.",
      });
    }

    try {
      const subadmins = await UserModel.find({
        role: "SubAdmin",
      }).select("-password -otp -otpExpires -__v"); // Exclude sensitive fields

      res.status(200).json({
        message: "Sub Admins fetched successfully.",
        subadmins,
      });
    } catch (error) {
      console.error("Error fetching Sub Admins:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };
}

export default AdminController;
