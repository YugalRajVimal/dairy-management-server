import xlsx from "xlsx";
import fs from "fs";
import MilkReportModel from "../../Schema/milk.report.schema.js";
import SalesReportModel from "../../Schema/sales.report.schema.js";
import AssetsReportModel from "../../Schema/assets.report.schema.js";
import UserModel from "../../Schema/user.schema.js";
import sendMail from "../../config/nodeMailer.config.js";
import IssuedAssetsToSubAdminModel from "../../Schema/issued.assets.subadmin.schema.js";
import UsedAssetsOfSubAdminModel from "../../Schema/used.assets.vendor.schema.js";
import RoutesModel from "../../Schema/routes.schema.js";

class SubAdminController {
  getProfileDetails = async (req, res) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const subAdmin = await UserModel.findById(req.user.id).select(
        "-password -otp -otpExpires -__v"
      );
      if (!subAdmin) {
        return res.status(404).json({ message: "SubAdmin not found" });
      }
      res.status(200).json({
        message: "SubAdmin profile fetched successfully.",
        profile: subAdmin,
      });
    } catch (error) {
      console.error("Error fetching subadmin profile:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };
  getDashboardDetails = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      // Count all Supervisors onboarded by this SubAdmin
      const allSupervisorCount = await UserModel.countDocuments({
        role: "Supervisor",
        onboardedBy: req.user.id,
      });

      // Count all Vendors onboarded by this SubAdmin
      const allVendorsCount = await UserModel.countDocuments({
        role: "Vendor",
        onboardedBy: req.user.id,
      });

      // Get count of all unique non-null/non-empty routes assigned to supervisors onboarded by this SubAdmin
      const supervisorRoutes = await UserModel.distinct("route", {
        role: "Supervisor",
        onboardedBy: req.user.id,
        route: { $exists: true, $ne: null, $ne: "" },
      });
      const allRoutesCount = supervisorRoutes.length;

      // Get all vendors onboarded by this SubAdmin and collect their vendorIds
      const vendorIds = await UserModel.find(
        { role: "Vendor", onboardedBy: req.user.id },
        "vendorId"
      ).distinct("vendorId");

      // Sum up milkWeightLtr from MilkReport whose vlcUploaderCode matches the vendorIds
      let milkWeightSum = 0;
      if (vendorIds.length > 0) {
        const totalMilkWeightLtr = await MilkReportModel.aggregate([
          { $match: { vlcUploaderCode: { $in: vendorIds } } },
          { $group: { _id: null, total: { $sum: "$milkWeightLtr" } } },
        ]);
        milkWeightSum =
          totalMilkWeightLtr.length > 0 ? totalMilkWeightLtr[0].total : 0;
      }

      // Total milkWeightLtr for reports uploaded by this SubAdmin (uploadedBy filter)
      const totalMilkWeightLtr2 = await MilkReportModel.aggregate([
        { $match: { uploadedBy: req.user.id } },
        { $group: { _id: null, total: { $sum: "$milkWeightLtr" } } },
      ]);
      const totalmilkWeightSum =
        totalMilkWeightLtr2.length > 0 ? totalMilkWeightLtr2[0].total : 0;

      res.status(200).json({
        message: "Dashboard details fetched successfully.",
        allSupervisorCount,
        allVendorsCount,
        allRoutesCount,
        milkWeightSum,
        totalmilkWeightSum,
      });
    } catch (error) {
      console.error("Error fetching dashboard details:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  onboardVendor = async (req, res) => {
    if (req.user.role != "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Admins can perform this action.",
      });
    }

    let {
      name,
      vendorId,
      email,
      phoneNumber,
      addressLine,
      city,
      state,
      pincode,
      route,
    } = req.body;

    // Trim string fields and convert email to lowercase
    if (typeof name === "string") name = name.trim();
    if (typeof vendorId === "string") vendorId = vendorId.trim();
    if (typeof email === "string") email = email.trim().toLowerCase(); // Convert email to lowercase
    if (typeof phoneNumber === "string") phoneNumber = phoneNumber.trim();
    if (typeof addressLine === "string") addressLine = addressLine.trim();
    if (typeof city === "string") city = city.trim();
    if (typeof state === "string") state = state.trim();
    if (typeof pincode === "string") pincode = pincode.trim();
    if (typeof route === "string") route = route.trim();

    // Validate presence and type for all fields, including route
    if (
      !name ||
      typeof name !== "string" ||
      !vendorId ||
      typeof vendorId !== "string" ||
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
      typeof pincode !== "string" ||
      !route ||
      typeof route !== "string"
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

    const vendorIdRegex = /^\d{6}$/; // Assuming 6-digit vendorIds
    if (!vendorIdRegex.test(vendorId)) {
      return res
        .status(400)
        .json({ message: "Invalid vendorId format. Must be 6 digits." });
    }

    try {
      // Check if a vendor with this email already exists
      const existingVendor = await UserModel.findOne({
        email, // Use the lowercase email for lookup
        role: "Vendor",
      });

      if (existingVendor) {
        return res
          .status(409)
          .json({ message: "Vendor with this email already exists." });
      }

      // Check if a vendor with this vendorId already exists
      const existingVendorWithId = await UserModel.findOne({
        vendorId,
        role: "Vendor", // Assuming vendorId is unique for Vendors
      });

      if (existingVendorWithId) {
        return res
          .status(409)
          .json({ message: "Vendor with this vendor ID already exists." });
      }

      const existingRoute = await RoutesModel.findOne({ route });
      if (!existingRoute) {
        return res.status(400).json({
          message:
            "This route does not exist yet. Please create the route while onboarding a Supervisor.",
        });
      }

      // Create a new vendor instance, include the route
      const newVendor = new UserModel({
        name,
        vendorId,
        email, // Use the lowercase email
        phoneNo: phoneNumber,
        role: "Vendor",
        otp: null,
        otpExpires: null,
        address: {
          addressLine,
          city,
          state,
          pincode,
        },
        onboardedBy: req.user.id,
        route, // Store the route field at the root level
      });

      // Save the new vendor to the database
      await newVendor.save();

      // Send the OTP to the vendor's email
      const mailSubject = "Welcome to ABC Company - Verify Your Vendor Account";
      const mailMessage = `Dear ${name},\n\nYour Vendor account has been created. Please use your email to log into your account:\n\nRegards,\nABC Company Team`;

      try {
        await sendMail(email, mailSubject, mailMessage); // Use the lowercase email
      } catch (mailError) {
        console.error("Error sending mail to vendor:", mailError);
        // Optionally: do not block onboarding if mail fails
      }

      // Respond with success message and vendor details
      res.status(201).json({
        message: "Vendor onboarded successfully. Mail sent to vendor.",
        subAdmin: {
          id: newVendor._id,
          name: newVendor.name,
          vendorId: newVendor.vendorId,
          email: newVendor.email,
          phoneNo: newVendor.phoneNo,
          role: newVendor.role,
          address: newVendor.address,
          route: newVendor.route,
        },
      });
    } catch (error) {
      console.error("Error onboarding Vendor:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getAllVendors = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const vendors = await UserModel.find({
        onboardedBy: req.user.id,
        role: "Vendor",
      }).select("-password -otp -otpExpires -__v"); // Exclude sensitive fields

      res.status(200).json({
        message: "Vendors fetched successfully.",
        vendors,
      });
    } catch (error) {
      console.error("Error fetching Vendors:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getAllRoutes = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }
    try {
      const routes = await RoutesModel.find({})
        .select("-__v")
        .sort({ route: 1 }); // sort alphabetically by route
      res.status(200).json({
        message: "Routes fetched successfully.",
        routes,
      });
    } catch (error) {
      console.error("Error fetching Routes:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  onboardSupervisor = async (req, res) => {
    if (req.user.role != "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Admins can perform this action.",
      });
    }

    let {
      name,
      supervisorId,
      email,
      phoneNumber,
      addressLine,
      city,
      state,
      pincode,
      route, // NEW FIELD: route
    } = req.body;

    // Trim string fields and convert email to lowercase
    if (typeof name === "string") name = name.trim();
    if (typeof supervisorId === "string") supervisorId = supervisorId.trim();
    if (typeof email === "string") email = email.trim().toLowerCase();
    if (typeof phoneNumber === "string") phoneNumber = phoneNumber.trim();
    if (typeof addressLine === "string") addressLine = addressLine.trim();
    if (typeof city === "string") city = city.trim();
    if (typeof state === "string") state = state.trim();
    if (typeof pincode === "string") pincode = pincode.trim();
    if (typeof route === "string") route = route.trim(); // Trim route

    // Validate presence and type for all fields (including route)
    if (
      !name ||
      typeof name !== "string" ||
      !supervisorId ||
      typeof supervisorId !== "string" ||
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
      typeof pincode !== "string" ||
      !route ||
      typeof route !== "string"
    ) {
      return res.status(400).json({
        message: "All fields are required and must be valid strings.",
      });
    }

    // More specific field validations
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format." });
    }

    const phoneRegex = /^(\+\d{1,4}\s*)?\d{10}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        message:
          "Invalid phone number format. Must be 10 digits, optionally preceded by a country code (e.g., +1 1234567890 or 1234567890).",
      });
    }

    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(pincode)) {
      return res
        .status(400)
        .json({ message: "Invalid pincode format. Must be 6 digits." });
    }

    const supervisorIdRegex = /^\d{6}$/;
    if (!supervisorIdRegex.test(supervisorId)) {
      return res
        .status(400)
        .json({ message: "Invalid supervisorId format. Must be 6 digits." });
    }

    try {
      // Check if a supervisor with this email already exists
      const existingSupervisor = await UserModel.findOne({
        email,
        role: "Supervisor",
      });

      if (existingSupervisor) {
        return res
          .status(409)
          .json({ message: "Supervisor with this email already exists." });
      }

      // Check if a supervisor with this supervisorId already exists
      const existingSupervisorWithId = await UserModel.findOne({
        supervisorId,
        role: "Supervisor",
      });

      if (existingSupervisorWithId) {
        return res.status(409).json({
          message: "Supervisor with this Supervisor ID already exists.",
        });
      }

      // Check if a supervisor with the same route already exists
      const existingSupervisorWithRoute = await UserModel.findOne({
        route: route,
        role: "Supervisor",
      });

      if (existingSupervisorWithRoute) {
        return res
          .status(409)
          .json({ message: "Supervisor with this route already exists." });
      }

      // Save the route to RouteModel if it doesn't already exist
      try {
        const existingRoute = await RoutesModel.findOne({ route });
        if (!existingRoute) {
          const newRoute = new RoutesModel({ route });
          await newRoute.save();
        }
      } catch (routeError) {
        console.error("Error saving route to RouteModel:", routeError);
        // Do not block onboarding if this fails
      }

      // Create a new supervisor instance, including route
      const newVendor = new UserModel({
        name,
        supervisorId,
        email,
        phoneNo: phoneNumber,
        role: "Supervisor",
        otp: null,
        otpExpires: null,
        address: {
          addressLine,
          city,
          state,
          pincode,
        },
        route, // Store route at the root level
        onboardedBy: req.user.id,
      });

      // Save the new supervisor to the database
      await newVendor.save();

      // Send the OTP to the supervisor's email
      const mailSubject =
        "Welcome to ABC Company - Verify Your Supervisor Account";
      const mailMessage = `Dear ${name},\n\nYour Supervisor account has been created. Please use your email to log into your account:\n\nRegards,\nABC Company Team`;

      try {
        await sendMail(email, mailSubject, mailMessage);
      } catch (mailError) {
        console.error("Error sending mail to supervisor:", mailError);
        // Optionally, you could respond with a warning, but don't block onboarding
      }

      // Respond with success message and supervisor details, include route
      res.status(201).json({
        message: "Supervisor onboarded successfully. Mail sent to Supervisor.",
        subAdmin: {
          id: newVendor._id,
          name: newVendor.name,
          supervisorId: newVendor.supervisorId,
          email: newVendor.email,
          phoneNo: newVendor.phoneNo,
          role: newVendor.role,
          address: newVendor.address,
          route: newVendor.route,
        },
      });
    } catch (error) {
      console.error("Error onboarding supervisor:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getAllSupervisors = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const vendors = await UserModel.find({
        onboardedBy: req.user.id,
        role: "Supervisor",
      }).select("-password -otp -otpExpires -__v"); // Exclude sensitive fields

      res.status(200).json({
        message: "Supervisor fetched successfully.",
        vendors,
      });
    } catch (error) {
      console.error("Error fetching Supervisor:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  uploadExcelFile = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON
      const rawData = xlsx.utils.sheet_to_json(worksheet, { range: 5 });

      const uploadedDate = new Date();

      // Utility: clean up keys + date
      const parseDate = (value) => {
        if (!value) return null;
        if (typeof value === "number") {
          // Excel serial date
          return xlsx.SSF.parse_date_code(value)
            ? new Date(
                xlsx.SSF.parse_date_code(value).y,
                xlsx.SSF.parse_date_code(value).m - 1,
                xlsx.SSF.parse_date_code(value).d
              )
            : null;
        }
        if (typeof value === "string") {
          // Convert "dd/mm/yyyy" -> proper Date
          const parts = value.split("/");
          if (parts.length === 3) {
            const [day, month, year] = parts.map((p) => parseInt(p, 10));
            return new Date(year, month - 1, day);
          }
          const parsed = new Date(value);
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      };

      // Pick only required fields
      const filteredData = rawData.map((row) => {
        return {
          uploadedOn: uploadedDate,
          uploadedBy: req.user.id,
          docDate: parseDate(row[" Doc Date"]?.toString().trim()),
          shift: row["Shift"]?.toString().trim() || null,
          vlcUploaderCode: row["Vlc Uploader Code"]?.toString().trim() || null,
          vlcName: row["VLC Name"]?.toString().trim() || null,
          milkWeightLtr: parseFloat(row["Milk Weight(LTR)"]) || 0,
          fatPercentage: parseFloat(row[" FAT(%)"]) || 0,
          snfPercentage: parseFloat(row["SNF(%)"]) || 0,
        };
      });

      // Validate before saving (skip rows missing required fields)
      const validReports = filteredData.filter(
        (r) => r.docDate && r.shift && r.vlcUploaderCode && r.vlcName
      );

      if (!validReports.length) {
        return res.status(400).json({
          error: "No valid rows found in Excel (missing required fields).",
        });
      }

      await MilkReportModel.insertMany(validReports);

      res.json({
        message: "Excel data extracted & saved successfully ✅",
        rows: validReports,
        rowsLength: validReports.length,
      });

      // Optional cleanup
      // fs.unlinkSync(req.file.path);
    } catch (error) {
      console.error("Error reading Excel:", error);
      res.status(500).json({ error: "Failed to process Excel file" });
    }
  };

  getUploadedMilkReport = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const userId = req.user.id;

      const milkReports = await MilkReportModel.find({ uploadedBy: userId })
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ uploadedOn: -1 }); // Sort by most recent upload first

      const totalReports = await MilkReportModel.countDocuments({
        uploadedBy: userId,
      });

      return res.status(200).json({
        message: "Milk reports fetched successfully ✅",
        data: milkReports,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalReports / parseInt(limit)),
        totalReports: totalReports,
      });
    } catch (error) {
      console.error("Error in getUploadedExcelReport:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };

  uploadSalesReport = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON, skipping the first 5 rows
      const rawData = xlsx.utils.sheet_to_json(worksheet, { range: 4 });

      const uploadedDate = new Date();

      // Utility: clean up keys + parse date values from Excel
      const parseDate = (value) => {
        if (!value) return null;
        if (typeof value === "number") {
          // Excel serial date
          const parsed = xlsx.SSF.parse_date_code(value);
          return parsed ? new Date(parsed.y, parsed.m - 1, parsed.d) : null;
        }
        if (typeof value === "string") {
          // Convert "dd/mm/yyyy" -> proper Date
          const parts = value.split("/");
          if (parts.length === 3) {
            const [day, month, year] = parts.map((p) => parseInt(p, 10));
            return new Date(year, month - 1, day);
          }
          const parsed = new Date(value);
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      };

      // Pick and transform fields for SalesReportModel
      const filteredData = rawData.map((row) => {
        return {
          uploadedOn: uploadedDate,
          uploadedBy: req.user.id,
          // Schema: itemCode (Date) - mapping Excel's "Doc Date" to this field
          itemCode: row["Item Code"]?.toString().trim() || null,
          // Schema: itemName (String) - assuming "Item Name" column in Excel
          itemName: row["Item Name"]?.toString().trim() || null,
          // Schema: vlcUploaderCode (String)
          vlcUploaderCode: row["VLC Uploader Code"]?.toString().trim() || null,
          // Schema: quantity (Number) - assuming "Quantity" column in Excel
          quantity: parseFloat(row["Quantity"]) || 0,
          // Schema: docDate (Number) - mapping Excel's "Doc Date" (as number/timestamp) to this field
          docDate: parseDate(row["Document_date"]?.toString().trim()),
        };
      });

      // Validate before saving (skip rows missing required fields or with invalid data)
      const validReports = filteredData.filter(
        (r) =>
          r.itemCode && // itemCode (Date) must be a valid Date object
          r.itemName && // itemName (String) must be a non-empty string
          r.vlcUploaderCode && // vlcUploaderCode (String) must be a non-empty string
          r.quantity !== null &&
          !isNaN(r.quantity) && // quantity (Number) must be a valid number
          r.docDate !== null &&
          !isNaN(r.docDate) // docDate (Number) must be a valid number
      );

      if (!validReports.length) {
        return res.status(400).json({
          error:
            "No valid rows found in Excel for Sales Report (missing required fields or invalid data).",
        });
      }

      await SalesReportModel.insertMany(validReports);

      res.json({
        message: "Sales Report Excel data extracted & saved successfully ✅",
        rows: validReports,
        rowsLength: validReports.length,
      });

      // Optional cleanup
      // fs.unlinkSync(req.file.path);
    } catch (error) {
      console.error("Error reading Sales Report Excel:", error);
      res
        .status(500)
        .json({ error: "Failed to process Sales Report Excel file" });
    }
  };

  getUploadedSalesReport = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const userId = req.user.id;

      const salesReport = await SalesReportModel.find({ uploadedBy: userId })
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ uploadedOn: -1 }); // Sort by most recent upload first

      const totalReports = await SalesReportModel.countDocuments({
        uploadedBy: userId,
      });

      return res.status(200).json({
        message: "Sales reports fetched successfully ✅",
        data: salesReport,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalReports / parseInt(limit)),
        totalReports: totalReports,
      });
    } catch (error) {
      console.error("Error in getUploadedSalesReport:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };

  // ✅ Add single sales report manually
  addSalesReport = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const { itemCode, itemName, vlcUploaderCode, quantity, docDate } =
        req.body;

      // Validate required fields
      if (!itemCode || !itemName || !vlcUploaderCode || !quantity || !docDate) {
        return res.status(400).json({
          error:
            "All fields (itemCode, itemName, vlcUploaderCode, quantity, docDate) are required.",
        });
      }

      // Parse date safely (handles both dd/mm/yyyy and yyyy-mm-dd)
      const parseDate = (value) => {
        if (!value) return null;
        if (typeof value === "string") {
          const parts = value.split("/");
          if (parts.length === 3) {
            const [day, month, year] = parts.map((p) => parseInt(p, 10));
            return new Date(year, month - 1, day);
          }
          const parsed = new Date(value);
          return isNaN(parsed) ? null : parsed;
        }
        return new Date(value);
      };

      const salesReport = new SalesReportModel({
        uploadedOn: new Date(),
        uploadedBy: req.user.id,
        itemCode: itemCode.toString().trim(),
        itemName: itemName.toString().trim(),
        vlcUploaderCode: vlcUploaderCode.toString().trim(),
        quantity: parseFloat(quantity),
        docDate: parseDate(docDate),
      });

      await salesReport.save();

      res.status(201).json({
        message: "Sales report added successfully ✅",
        report: salesReport,
      });
    } catch (error) {
      console.error("Error adding sales report:", error);
      res.status(500).json({ error: "Failed to add sales report" });
    }
  };

  // controllers/assets.controller.js

  // Add or update assets report

  // addAssetsReport = async (req, res) => {
  //   try {
  //     const {
  //       vlcCode,
  //       srNo,
  //       stockNo,
  //       rt,
  //       duplicate,
  //       vlcName,
  //       status,
  //       cStatus,
  //       can,
  //       lid,
  //       pvc,
  //       dps,
  //       keyboard,
  //       printer,
  //       charger,
  //       stripper,
  //       solar,
  //       controller,
  //       ews,
  //       display,
  //       battery,
  //       bond,
  //       vspSign,
  //     } = req.body;

  //     if (!vlcCode) {
  //       return res.status(400).json({ error: "vlcCode is required" });
  //     }

  //     const uploadedOn = new Date();

  //     // Check if asset already exists
  //     let existingAsset = await AssetsReportModel.findOne({ vlcCode });

  //     if (existingAsset) {
  //       return res.status(409).json({
  //         message:
  //           "Assets record with this vlcCode already exists. Please edit the existing record.",
  //         data: existingAsset,
  //       });
  //     }

  //     // Normalize DPS field (split by comma, trim spaces)
  //     let dpsValues = [];
  //     if (dps) {
  //       if (typeof dps === "string") {
  //         dpsValues = dps
  //           .split(",")
  //           .map((v) => v.trim())
  //           .filter((v) => v.length > 0);
  //       } else if (Array.isArray(dps)) {
  //         dpsValues = dps
  //           .map((v) => v.toString().trim())
  //           .filter((v) => v.length > 0);
  //       }
  //     }

  //     if (dpsValues.length > 0) {
  //       // Get all assets that have some DPS value stored
  //       const possibleConflicts = await AssetsReportModel.find({
  //         dps: { $exists: true, $ne: "" },
  //       });

  //       let conflicts = [];

  //       possibleConflicts.forEach((asset) => {
  //         const assetDpsValues = asset.dps
  //           .split(",")
  //           .map((v) => v.trim())
  //           .filter((v) => v.length > 0);

  //         const overlapping = assetDpsValues.filter((val) =>
  //           dpsValues.includes(val)
  //         );

  //         if (overlapping.length > 0) {
  //           conflicts.push({
  //             vlcCode: asset.vlcCode,
  //             existingDps: overlapping,
  //           });
  //         }
  //       });

  //       if (conflicts.length > 0) {
  //         return res.status(409).json({
  //           message: "Some DPS values already exist in other asset records.",
  //           conflicts,
  //         });
  //       }
  //     }

  //     // If not present, create a new one
  //     const newAsset = new AssetsReportModel({
  //       uploadedOn,
  //       uploadedBy: req.user.id, // assuming `req.user` is populated
  //       vlcCode,
  //       srNo,
  //       stockNo,
  //       rt,
  //       duplicate,
  //       vlcName,
  //       status,
  //       cStatus,
  //       can,
  //       lid,
  //       pvc,
  //       dps,
  //       keyboard,
  //       printer,
  //       charger,
  //       stripper,
  //       solar,
  //       controller,
  //       ews,
  //       display,
  //       battery,
  //       bond,
  //       vspSign,
  //       history: [], // no history initially
  //     });

  //     await newAsset.save();
  //     return res.json({
  //       message: "New assets record created successfully ✅",
  //       data: newAsset,
  //     });
  //   } catch (error) {
  //     console.error("Error in addAssetsReport:", error);
  //     return res.status(500).json({ error: "Internal server error" });
  //   }
  // };

  addAssetsReport = async (req, res) => {
    try {
      const {
        vlcCode,
        srNo,
        stockNo,
        rt,
        duplicate,
        vlcName,
        status,
        cStatus,
        can,
        lid,
        pvc,
        dps,
        keyboard,
        printer,
        charger,
        stripper,
        solar,
        controller,
        ews,
        display,
        battery,
        bond,
        vspSign,
      } = req.body;

      const subAdminId = req.user.id;
      if (!vlcCode)
        return res.status(400).json({ error: "vlcCode is required" });

      const uploadedOn = new Date();

      // Check if asset already exists
      const existingAsset = await AssetsReportModel.findOne({ vlcCode });
      if (existingAsset) {
        return res.status(409).json({
          message:
            "Assets record with this vlcCode already exists. Please edit the existing record.",
          data: existingAsset,
        });
      }

      // Helper to parse comma-separated strings
      const parseCommaValues = (val) => {
        if (!val) return [];
        if (Array.isArray(val)) return val.map((v) => v.trim()).filter(Boolean);
        return val
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
      };

      const dpsValues = parseCommaValues(dps);
      const bondValues = parseCommaValues(bond);

      // ✅ Step 1: Validate issued assets exist
      const issuedAssets = await IssuedAssetsToSubAdminModel.findOne({
        subAdminId,
      });
      if (!issuedAssets) {
        return res.status(400).json({
          message:
            "No issued assets found for this sub-admin. Cannot mark as used.",
        });
      }

      // ✅ Step 2: Validate DPS/BOND exist in issued records
      const issuedDpsList = parseCommaValues(issuedAssets.dps);
      const issuedBondList = parseCommaValues(issuedAssets.bond);

      const missingDps = dpsValues.filter(
        (val) => !issuedDpsList.includes(val)
      );
      const missingBonds = bondValues.filter(
        (val) => !issuedBondList.includes(val)
      );

      if (missingDps.length > 0 || missingBonds.length > 0) {
        return res.status(400).json({
          message: "Some DPS or Bond values are not issued to this sub-admin.",
          missing: { dps: missingDps, bond: missingBonds },
        });
      }

      // ✅ Step 3: DPS conflict check
      if (dpsValues.length > 0) {
        const possibleConflicts = await AssetsReportModel.find({
          dps: { $exists: true, $ne: "" },
        });
        const conflicts = [];

        possibleConflicts.forEach((asset) => {
          const assetDpsValues = parseCommaValues(asset.dps);
          const overlapping = assetDpsValues.filter((val) =>
            dpsValues.includes(val)
          );
          if (overlapping.length > 0) {
            conflicts.push({
              vlcCode: asset.vlcCode,
              existingDps: overlapping,
            });
          }
        });

        if (conflicts.length > 0) {
          return res.status(409).json({
            message: "Some DPS values already exist in other asset records.",
            conflicts,
          });
        }
      }

      // ✅ Step 4: Check inventory availability
      const usedAssets = await UsedAssetsOfSubAdminModel.findOne({
        subAdminId,
      });
      const issued = issuedAssets || {};
      const used = usedAssets || {};

      const numericFields = [
        "rt",
        "duplicate",
        "can",
        "lid",
        "pvc",
        "keyboard",
        "printer",
        "charger",
        "stripper",
        "solar",
        "controller",
        "ews",
        "display",
        "battery",
      ];

      for (const field of numericFields) {
        const issuedVal = Number(issued[field] || 0);
        const usedVal = Number(used[field] || 0);
        const newVal = Number(req.body[field] || 0);

        const available = issuedVal - usedVal;
        if (newVal > available) {
          return res.status(400).json({
            message: `Not enough ${field.toUpperCase()} assets left in inventory.`,
            details: {
              issued: issuedVal,
              used: usedVal,
              available,
              requested: newVal,
            },
          });
        }
      }

      // ✅ Step 5: Create new asset report
      const newAsset = new AssetsReportModel({
        uploadedOn,
        uploadedBy: req.user.id,
        vlcCode,
        srNo,
        stockNo,
        rt,
        duplicate,
        vlcName,
        status,
        cStatus,
        can,
        lid,
        pvc,
        dps,
        keyboard,
        printer,
        charger,
        stripper,
        solar,
        controller,
        ews,
        display,
        battery,
        bond,
        vspSign,
        history: [],
      });
      await newAsset.save();

      // ✅ Step 6: Update UsedAssetsOfSubAdminModel
      if (usedAssets) {
        usedAssets.history.push({
          rt: usedAssets.rt,
          can: usedAssets.can,
          lid: usedAssets.lid,
          pvc: usedAssets.pvc,
          dps: usedAssets.dps,
          keyboard: usedAssets.keyboard,
          printer: usedAssets.printer,
          charger: usedAssets.charger,
          stripper: usedAssets.stripper,
          solar: usedAssets.solar,
          controller: usedAssets.controller,
          ews: usedAssets.ews,
          display: usedAssets.display,
          battery: usedAssets.battery,
          bond: usedAssets.bond,
          changedOn: new Date(),
        });

        numericFields.forEach(
          (f) => (usedAssets[f] += Number(req.body[f]) || 0)
        );

        const existingDps = parseCommaValues(usedAssets.dps);
        const existingBond = parseCommaValues(usedAssets.bond);
        usedAssets.dps = Array.from(
          new Set([...existingDps, ...dpsValues])
        ).join(",");
        usedAssets.bond = Array.from(
          new Set([...existingBond, ...bondValues])
        ).join(",");

        await usedAssets.save();
      } else {
        const newUsed = new UsedAssetsOfSubAdminModel({
          uploadedOn,
          uploadedBy: req.user.id,
          subAdminId,
          rt,
          duplicate,
          can,
          lid,
          pvc,
          dps: dpsValues.join(","),
          keyboard,
          printer,
          charger,
          stripper,
          solar,
          controller,
          ews,
          display,
          battery,
          bond: bondValues.join(","),
          history: [],
        });
        await newUsed.save();
      }

      return res.json({
        message:
          "New asset record created and UsedAssets updated successfully ✅",
        data: newAsset,
      });
    } catch (error) {
      console.error("Error in addAssetsReport:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };

  // Update existing assets record & push old values into history
  // updateAssetsReport = async (req, res) => {
  //   try {
  //     const {
  //       vlcCode,
  //       srNo,
  //       stockNo,
  //       rt,
  //       duplicate,
  //       vlcName,
  //       status,
  //       cStatus,
  //       can,
  //       lid,
  //       pvc,
  //       dps,
  //       keyboard,
  //       printer,
  //       charger,
  //       stripper,
  //       solar,
  //       controller,
  //       ews,
  //       display,
  //       battery,
  //       bond,
  //       vspSign,
  //     } = req.body;

  //     if (!vlcCode) {
  //       return res.status(400).json({ error: "vlcCode is required" });
  //     }

  //     const changedOn = new Date();

  //     // Find the asset
  //     let existingAsset = await AssetsReportModel.findOne({ vlcCode });

  //     if (!existingAsset) {
  //       return res.status(404).json({
  //         message: "Assets record not found. Please create a new record first.",
  //       });
  //     }

  //     let isChanged = false;

  //     // Define fields that can be updated and should be checked for changes
  //     const updatableFields = [
  //       "srNo",
  //       "stockNo",
  //       "rt",
  //       "duplicate",
  //       "vlcName",
  //       "status",
  //       "cStatus",
  //       "can",
  //       "lid",
  //       "pvc",
  //       "dps",
  //       "keyboard",
  //       "printer",
  //       "charger",
  //       "stripper",
  //       "solar",
  //       "controller",
  //       "ews",
  //       "display",
  //       "battery",
  //       "bond",
  //       "vspSign",
  //     ];

  //     for (const field of updatableFields) {
  //       const newValue = req.body[field];
  //       const existingValue = existingAsset[field];

  //       // Only consider a change if a new value is provided in the request body
  //       // and it's not null/undefined
  //       if (newValue !== undefined && newValue !== null) {
  //         if (typeof existingValue === "number") {
  //           // For number fields, parse the new value and compare
  //           const parsedNewValue = parseFloat(newValue);
  //           // Check if parsedNewValue is a valid number and different from existing
  //           if (!isNaN(parsedNewValue) && parsedNewValue !== existingValue) {
  //             isChanged = true;
  //             break;
  //           }
  //         } else {
  //           // For string fields, trim and compare
  //           const trimmedNewValue = String(newValue).trim();
  //           const trimmedExistingValue = String(existingValue || "").trim(); // Ensure existingValue is treated as string, default to empty string if null/undefined

  //           if (trimmedNewValue !== trimmedExistingValue) {
  //             isChanged = true;
  //             break;
  //           }
  //         }
  //       }
  //     }

  //     if (!isChanged) {
  //       return res.status(400).json({
  //         message: "No changes detected. Please provide new values to update.",
  //       });
  //     }

  //     if (dps) {
  //       // Normalize DPS field (split by comma, trim spaces)
  //       let dpsValues = [];
  //       if (dps) {
  //         if (typeof dps === "string") {
  //           dpsValues = dps
  //             .split(",")
  //             .map((v) => v.trim())
  //             .filter((v) => v.length > 0);
  //         } else if (Array.isArray(dps)) {
  //           dpsValues = dps
  //             .map((v) => v.toString().trim())
  //             .filter((v) => v.length > 0);
  //         }
  //       }

  //       if (dpsValues.length > 0) {
  //         // Get all assets that have some DPS value stored, excluding the current asset being updated
  //         const possibleConflicts = await AssetsReportModel.find({
  //           dps: { $exists: true, $ne: "" },
  //           vlcCode: { $ne: existingAsset.vlcCode }, // Exclude the current asset's vlcCode
  //         });

  //         let conflicts = [];

  //         possibleConflicts.forEach((asset) => {
  //           const assetDpsValues = asset.dps
  //             .split(",")
  //             .map((v) => v.trim())
  //             .filter((v) => v.length > 0);

  //           const overlapping = assetDpsValues.filter((val) =>
  //             dpsValues.includes(val)
  //           );

  //           if (overlapping.length > 0) {
  //             conflicts.push({
  //               vlcCode: asset.vlcCode,
  //               existingDps: overlapping,
  //             });
  //           }
  //         });

  //         if (conflicts.length > 0) {
  //           return res.status(409).json({
  //             message: "Some DPS values already exist in other asset records.",
  //             conflicts,
  //           });
  //         }
  //       }
  //     }

  //     // Push current values into history before updating
  //     existingAsset.history.push({
  //       srNo: existingAsset.srNo,
  //       stockNo: existingAsset.stockNo,
  //       rt: existingAsset.rt,
  //       status: existingAsset.status,
  //       cStatus: existingAsset.cStatus,
  //       can: existingAsset.can,
  //       lid: existingAsset.lid,
  //       pvc: existingAsset.pvc,
  //       dps: existingAsset.dps,
  //       keyboard: existingAsset.keyboard,
  //       printer: existingAsset.printer,
  //       charger: existingAsset.charger,
  //       stripper: existingAsset.stripper,
  //       solar: existingAsset.solar,
  //       controller: existingAsset.controller,
  //       ews: existingAsset.ews,
  //       display: existingAsset.display,
  //       battery: existingAsset.battery,
  //       bond: existingAsset.bond,
  //       vspSign: existingAsset.vspSign,
  //       changedOn: changedOn,
  //     });

  //     // Update with new values
  //     existingAsset.srNo = srNo ?? existingAsset.srNo;
  //     existingAsset.stockNo = stockNo ?? existingAsset.stockNo;
  //     existingAsset.rt = rt ?? existingAsset.rt;
  //     existingAsset.duplicate = duplicate ?? existingAsset.duplicate;
  //     existingAsset.vlcName = vlcName ?? existingAsset.vlcName;
  //     existingAsset.status = status ?? existingAsset.status;
  //     existingAsset.cStatus = cStatus ?? existingAsset.cStatus;
  //     existingAsset.can = can ?? existingAsset.can;
  //     existingAsset.lid = lid ?? existingAsset.lid;
  //     existingAsset.pvc = pvc ?? existingAsset.pvc;
  //     existingAsset.dps = dps ?? existingAsset.dps;
  //     existingAsset.keyboard = keyboard ?? existingAsset.keyboard;
  //     existingAsset.printer = printer ?? existingAsset.printer;
  //     existingAsset.charger = charger ?? existingAsset.charger;
  //     existingAsset.stripper = stripper ?? existingAsset.stripper;
  //     existingAsset.solar = solar ?? existingAsset.solar;
  //     existingAsset.controller = controller ?? existingAsset.controller;
  //     existingAsset.ews = ews ?? existingAsset.ews;
  //     existingAsset.display = display ?? existingAsset.display;
  //     existingAsset.battery = battery ?? existingAsset.battery;
  //     existingAsset.bond = bond ?? existingAsset.bond;
  //     existingAsset.vspSign = vspSign ?? existingAsset.vspSign;

  //     await existingAsset.save();

  //     return res.json({
  //       message: "Assets record updated & history saved ✅",
  //       data: existingAsset,
  //     });
  //   } catch (error) {
  //     console.error("Error in updateAssetsReport:", error);
  //     return res.status(500).json({ error: "Internal server error" });
  //   }
  // };

  updateAssetsReport = async (req, res) => {
    try {
      const {
        vlcCode,
        srNo,
        stockNo,
        rt,
        duplicate,
        vlcName,
        status,
        cStatus,
        can,
        lid,
        pvc,
        dps,
        keyboard,
        printer,
        charger,
        stripper,
        solar,
        controller,
        ews,
        display,
        battery,
        bond,
        vspSign,
      } = req.body;

      const subAdminId = req.user.id;
      if (!vlcCode) {
        return res.status(400).json({ error: "vlcCode is required" });
      }

      const changedOn = new Date();

      // Find the existing asset record
      let existingAsset = await AssetsReportModel.findOne({ vlcCode });
      if (!existingAsset) {
        return res.status(404).json({
          message: "Assets record not found. Please create it first.",
        });
      }

      // Helper to normalize comma-separated strings
      const parseCommaValues = (val) => {
        if (!val) return [];
        if (Array.isArray(val)) return val.map((v) => v.trim()).filter(Boolean);
        return val
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
      };

      const dpsValues = parseCommaValues(dps);
      const bondValues = parseCommaValues(bond);

      // ================================
      // 🔍 Step 1: Detect if any change exists
      // ================================
      const updatableFields = [
        "srNo",
        "stockNo",
        "rt",
        "duplicate",
        "vlcName",
        "status",
        "cStatus",
        "can",
        "lid",
        "pvc",
        "dps",
        "keyboard",
        "printer",
        "charger",
        "stripper",
        "solar",
        "controller",
        "ews",
        "display",
        "battery",
        "bond",
        "vspSign",
      ];

      let isChanged = false;
      for (const field of updatableFields) {
        const newValue = req.body[field];
        const existingValue = existingAsset[field];
        if (newValue !== undefined && newValue !== null) {
          if (typeof existingValue === "number") {
            const parsedNewValue = parseFloat(newValue);
            if (!isNaN(parsedNewValue) && parsedNewValue !== existingValue) {
              isChanged = true;
              break;
            }
          } else {
            const trimmedNewValue = String(newValue).trim();
            const trimmedExistingValue = String(existingValue || "").trim();
            if (trimmedNewValue !== trimmedExistingValue) {
              isChanged = true;
              break;
            }
          }
        }
      }

      if (!isChanged) {
        return res.status(400).json({
          message: "No changes detected. Provide new values to update.",
        });
      }

      // ================================
      // ✅ Step 2: DPS & Bond Validation (must exist in issued)
      // ================================
      const issuedAssets = await IssuedAssetsToSubAdminModel.findOne({
        subAdminId,
      });
      if (!issuedAssets) {
        return res.status(400).json({
          message:
            "No issued assets found for this sub-admin. Cannot validate update.",
        });
      }

      const issuedDpsList = parseCommaValues(issuedAssets.dps);
      const issuedBondList = parseCommaValues(issuedAssets.bond);

      const missingDps = dpsValues.filter(
        (val) => !issuedDpsList.includes(val)
      );
      const missingBonds = bondValues.filter(
        (val) => !issuedBondList.includes(val)
      );

      if (missingDps.length > 0 || missingBonds.length > 0) {
        return res.status(400).json({
          message: "Some DPS or Bond values are not issued to this sub-admin.",
          missing: { dps: missingDps, bond: missingBonds },
        });
      }

      // ================================
      // ⚠️ Step 3: DPS Conflict Check (with other records)
      // ================================
      if (dpsValues.length > 0) {
        const possibleConflicts = await AssetsReportModel.find({
          dps: { $exists: true, $ne: "" },
          vlcCode: { $ne: vlcCode },
        });

        const conflicts = [];
        possibleConflicts.forEach((asset) => {
          const assetDpsValues = parseCommaValues(asset.dps);
          const overlapping = assetDpsValues.filter((val) =>
            dpsValues.includes(val)
          );
          if (overlapping.length > 0) {
            conflicts.push({
              vlcCode: asset.vlcCode,
              existingDps: overlapping,
            });
          }
        });

        if (conflicts.length > 0) {
          return res.status(409).json({
            message: "Some DPS values already exist in other asset records.",
            conflicts,
          });
        }
      }

      // ================================
      // ⚠️ Step 3.1: Bond Conflict Check (with other records)
      // ================================
      if (bondValues.length > 0) {
        const possibleConflicts = await AssetsReportModel.find({
          bond: { $exists: true, $ne: "" },
          vlcCode: { $ne: vlcCode },
        });

        const conflicts = [];
        possibleConflicts.forEach((asset) => {
          const assetBondValues = parseCommaValues(asset.bond);
          const overlapping = assetBondValues.filter((val) =>
            bondValues.includes(val)
          );
          if (overlapping.length > 0) {
            conflicts.push({
              vlcCode: asset.vlcCode,
              existingBond: overlapping,
            });
          }
        });

        if (conflicts.length > 0) {
          return res.status(409).json({
            message: "Some Bond values already exist in other asset records.",
            conflicts,
          });
        }
      }

      // ================================
      // 🔢 Step 4: Validate inventory (issued vs used)
      // ================================
      const usedAssets = await UsedAssetsOfSubAdminModel.findOne({
        subAdminId,
      });
      const used = usedAssets || {};
      const issued = issuedAssets || {};

      const numericFields = [
        "rt",
        "duplicate",
        "can",
        "lid",
        "pvc",
        "keyboard",
        "printer",
        "charger",
        "stripper",
        "solar",
        "controller",
        "ews",
        "display",
        "battery",
      ];

      for (const field of numericFields) {
        const issuedVal = Number(issued[field] || 0);
        const usedVal = Number(used[field] || 0);
        const newVal = Number(req.body[field] || existingAsset[field] || 0);

        const available =
          issuedVal - usedVal + Number(existingAsset[field] || 0);
        if (newVal > available) {
          return res.status(400).json({
            message: `Not enough ${field.toUpperCase()} assets left in inventory.`,
            details: {
              issued: issuedVal,
              used: usedVal,
              available,
              requested: newVal,
            },
          });
        }
      }

      // ================================
      // 🕒 Step 5: Save history before update
      // ================================
      existingAsset.history.push({
        srNo: existingAsset.srNo,
        stockNo: existingAsset.stockNo,
        rt: existingAsset.rt,
        duplicate: existingAsset.duplicate,
        vlcName: existingAsset.vlcName,
        status: existingAsset.status,
        cStatus: existingAsset.cStatus,
        can: existingAsset.can,
        lid: existingAsset.lid,
        pvc: existingAsset.pvc,
        dps: existingAsset.dps,
        keyboard: existingAsset.keyboard,
        printer: existingAsset.printer,
        charger: existingAsset.charger,
        stripper: existingAsset.stripper,
        solar: existingAsset.solar,
        controller: existingAsset.controller,
        ews: existingAsset.ews,
        display: existingAsset.display,
        battery: existingAsset.battery,
        bond: existingAsset.bond,
        vspSign: existingAsset.vspSign,
        changedOn,
      });

      //      // 🕒 Step 5: Save history before update
      // existingAsset.history.push({ ... });

      // 💾 Store OLD numeric values before overwriting anything
      const oldNumericValues = {};
      numericFields.forEach((f) => {
        oldNumericValues[f] = Number(existingAsset[f] || 0);
      });

      // 🧾 Step 6: Apply new values
      updatableFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          existingAsset[field] = req.body[field];
        }
      });

      await existingAsset.save();

      // ================================
      // 🔁 Step 7: Update UsedAssetsOfSubAdminModel (with correct old values)
      // ================================
      if (usedAssets) {
        numericFields.forEach((f) => {
          const oldVal = oldNumericValues[f];
          const newVal = Number(req.body[f] ?? oldVal);
          const diff = newVal - oldVal;

          if (!isNaN(diff) && diff !== 0) {
            usedAssets[f] = (usedAssets[f] || 0) + diff;
          }
        });

        // 🔒 Clamp negative values to zero (safety check)
        numericFields.forEach((f) => {
          usedAssets[f] = Math.max(0, usedAssets[f]);
        });

        const existingDps = parseCommaValues(usedAssets.dps);
        const existingBond = parseCommaValues(usedAssets.bond);
        usedAssets.dps = Array.from(
          new Set([...existingDps, ...dpsValues])
        ).join(",");
        usedAssets.bond = Array.from(
          new Set([...existingBond, ...bondValues])
        ).join(",");

        usedAssets.history.push({ changedOn });
        await usedAssets.save();
      }

      return res.json({
        message: "Assets record updated successfully ✅",
        data: existingAsset,
      });
    } catch (error) {
      console.error("Error in updateAssetsReport:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };

  getAssetsReport = async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const userId = req.user.id;

      const assetsReports = await AssetsReportModel.find({ uploadedBy: userId })
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ uploadedOn: -1 }); // Sort by most recent first

      const totalReports = await AssetsReportModel.countDocuments({
        uploadedBy: userId,
      });

      return res.status(200).json({
        message: "Assets reports fetched successfully ✅",
        data: assetsReports,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalReports / parseInt(limit)),
        totalReports: totalReports,
      });
    } catch (error) {
      console.error("Error in getAssetsReport:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };

  getUploadedAssetsReport = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const userId = req.user.id;

      const assetsReport = await AssetsReportModel.find({ uploadedBy: userId })
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ uploadedOn: -1 }); // Sort by most recent upload first

      const totalReports = await AssetsReportModel.countDocuments({
        uploadedBy: userId,
      });

      return res.status(200).json({
        message: "Assets reports fetched successfully ✅",
        data: assetsReport,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalReports / parseInt(limit)),
        totalReports: totalReports,
      });
    } catch (error) {
      console.error("Error in getUploadedSalesReport:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };

  getIssuedAssetsReport = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const subAdminId = req.user.id; // use the authenticated user's ID

      const assetsReport = await IssuedAssetsToSubAdminModel.findOne({
        subAdminId,
      }).lean();

      const usedAssetsReport = await UsedAssetsOfSubAdminModel.findOne({
        subAdminId,
      }).lean();

      if (!assetsReport) {
        return res.status(404).json({
          message: "No issued assets report found for this sub-admin.",
        });
      }

      console.log(assetsReport, usedAssetsReport);
      res.status(200).json({
        message: "Issued assets report fetched successfully.",
        data: assetsReport,
        usedAssets: usedAssetsReport,
      });
    } catch (error) {
      console.error("Error fetching issued assets report:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };
}

export default SubAdminController;
