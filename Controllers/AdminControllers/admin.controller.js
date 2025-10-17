import sendMail from "../../config/nodeMailer.config.js";
import IssuedAssetsToSubAdminModel from "../../Schema/issued.assets.subadmin.schema.js";
import UserModel from "../../Schema/user.schema.js";

class AdminController {
  onboardSubAdmin = async (req, res) => {
    if (req.user.role != "Admin") {
      return res.status(403).json({
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
      return res.status(400).json({
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

  getAllIssuedAssetsReport = async (req, res) => {
    if (req.user.role !== "Admin") {
      return res.status(403).json({
        message: "Unauthorized: Only Admins can perform this action.",
      });
    }

    try {
      // Get pagination params from query
      const { page = 1, limit = 10 } = req.query;

      // Count total documents
      const totalCount = await IssuedAssetsToSubAdminModel.countDocuments({});
      const totalPages = Math.ceil(totalCount / limit);

      // Fetch paginated data
      const assetsReport = await IssuedAssetsToSubAdminModel.find({})
        .populate("subAdminId", "_id name email") // Populate subAdminId with _id, name, and email
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean();

      if (!assetsReport || assetsReport.length === 0) {
        return res
          .status(404)
          .json({ message: "No issued assets reports found." });
      }

      res.status(200).json({
        message: "Issued assets reports fetched successfully.",
        data: assetsReport,
        totalPages,
        currentPage: Number(page),
      });
    } catch (error) {
      console.error("Error fetching issued assets reports:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getIssuedAssetsReport = async (req, res) => {
    if (req.user.role !== "Admin") {
      return res.status(403).json({
        message: "Unauthorized: Only Admins can perform this action.",
      });
    }

    try {
      const { subAdminId } = req.query; // Expect subAdminId as a query parameter

      if (!subAdminId) {
        return res.status(400).json({
          message: "subAdminId is required to fetch a specific report.",
        });
      }

      const assetsReport = await IssuedAssetsToSubAdminModel.findOne({
        subAdminId,
      }).lean(); // Return plain JavaScript objects

      if (!assetsReport) {
        return res.status(404).json({
          message: "No issued assets report found for this sub-admin.",
        });
      }

      res.status(200).json({
        message: "Issued assets report fetched successfully.",
        data: assetsReport,
      });
    } catch (error) {
      console.error("Error fetching issued assets report:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  addIssuedAssets = async (req, res) => {
    if (req.user.role !== "Admin") {
      return res.status(403).json({
        message: "Unauthorized: Only Admins can perform this action.",
      });
    }

    try {
      const { subAdminId, ...formData } = req.body;

      if (!subAdminId) {
        return res.status(400).json({ message: "subAdminId is required." });
      }

      // Assuming IssuedAssetsToSubAdminModel is imported from "../../Schema/issued.assets.subadmin.schema.js"

      // Check if a report already exists for this subAdminId
      const existingReport = await IssuedAssetsToSubAdminModel.findOne({
        subAdminId,
      });
      if (existingReport) {
        return res.status(409).json({
          message:
            "Issued assets report already exists for this sub-admin. Please use update instead.",
        });
      }

      const newAssetReport = new IssuedAssetsToSubAdminModel({
        ...formData,
        subAdminId,
        uploadedOn: new Date(),
        uploadedBy: req.user.id, // Assuming req.user._id is available from jwtAuth
      });

      const savedAssetReport = await newAssetReport.save();

      res.status(201).json({
        message: "Issued assets added successfully.",
        data: savedAssetReport,
      });
    } catch (error) {
      console.error("Error adding issued assets:", error);
      if (error.code === 11000) {
        // Duplicate key error
        const field = Object.keys(error.keyPattern)[0];
        return res.status(409).json({
          message: `Duplicate value for ${field}: ${error.keyValue[field]}.`,
        });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  updateIssuedAssets = async (req, res) => {
    if (req.user.role !== "Admin") {
      return res.status(403).json({
        message: "Unauthorized: Only Admins can perform this action.",
      });
    }

    try {
      const { _id, ...updatedFields } = req.body;

      if (!_id) {
        return res
          .status(400)
          .json({ message: "Asset report ID is required for update." });
      }

      // Assuming IssuedAssetsToSubAdminModel is imported from "../../Schema/issued.assets.subadmin.schema.js"
      const IssuedAssetsToSubAdminModel = (
        await import("../../Schema/issued.assets.subadmin.schema.js")
      ).default;

      const existingAssetReport = await IssuedAssetsToSubAdminModel.findById(
        _id
      );

      if (!existingAssetReport) {
        return res
          .status(404)
          .json({ message: "Issued assets report not found." });
      }

      // Create a history entry with the current values before updating
      const historyEntry = {
        changedOn: new Date(),
        srNo: existingAssetReport.srNo || "-",
        stockNo: existingAssetReport.stockNo || "-",
        rt: existingAssetReport.rt || "-",
        status: existingAssetReport.status || "-",
        cStatus: existingAssetReport.cStatus || "-",
        can: String(existingAssetReport.can || 0), // Convert to String for history
        lid: String(existingAssetReport.lid || 0),
        pvc: String(existingAssetReport.pvc || 0),
        dps: String(existingAssetReport.dps || "-"), // dps is string in main schema, default 0. History default "-".
        keyboard: String(existingAssetReport.keyboard || 0),
        printer: String(existingAssetReport.printer || 0),
        charger: String(existingAssetReport.charger || 0),
        stripper: String(existingAssetReport.stripper || 0),
        solar: String(existingAssetReport.solar || 0),
        controller: String(existingAssetReport.controller || 0),
        ews: String(existingAssetReport.ews || 0),
        display: String(existingAssetReport.display || 0),
        battery: String(existingAssetReport.battery || 0),
        bond: String(existingAssetReport.bond || 0),
        vspSign: String(existingAssetReport.vspSign || 0),
      };

      let hasChanges = false;

      // Apply updates and check for changes
      for (const key in updatedFields) {
        // Ensure the key is a direct property of the schema and not _id or history itself
        if (
          existingAssetReport.schema.paths[key] &&
          existingAssetReport[key] !== updatedFields[key]
        ) {
          existingAssetReport[key] = updatedFields[key];
          hasChanges = true;
        }
      }

      // Only push to history if there were actual changes
      if (hasChanges) {
        existingAssetReport.history.push(historyEntry);
      }

      // Save the updated document
      const updatedAssetReport = await existingAssetReport.save();

      res.status(200).json({
        message: "Issued assets updated successfully.",
        data: updatedAssetReport,
      });
    } catch (error) {
      console.error("Error updating issued assets:", error);
      if (error.code === 11000) {
        // Duplicate key error
        const field = Object.keys(error.keyPattern)[0];
        return res.status(409).json({
          message: `Duplicate value for ${field}: ${error.keyValue[field]}.`,
        });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  };
}

export default AdminController;
