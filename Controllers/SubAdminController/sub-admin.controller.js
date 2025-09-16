import xlsx from "xlsx";
import fs from "fs";
import MilkReportModel from "../../Schema/milk.report.schema.js";
import SalesReportModel from "../../Schema/sales.report.schema.js";
import AssetsReportModel from "../../Schema/assets.report.schema.js";
import UserModel from "../../Schema/user.schema.js";
import sendMail from "../../config/nodeMailer.config.js";

class SubAdminController {
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

    // Validate presence and type for all fields
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
      // Check if a sub-admin with this email already exists
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

      // Create a new sub-admin instance
      const newVendor = new UserModel({
        name,
        vendorId,
        email, // Use the lowercase email
        phoneNo: phoneNumber, // Use phoneNo as per user.schema.js
        role: "Vendor", // Assign a default role
        otp: null,
        otpExpires: null,
        address: {
          addressLine,
          city,
          state,
          pincode,
        },
        onboardedBy: req.user.id,
      });

      // Save the new sub-admin to the database
      await newVendor.save();

      // Send the OTP to the sub-admin's email
      const mailSubject = "Welcome to ABC Company - Verify Your Vendor Account";
      const mailMessage = `Dear ${name},\n\nYour Vendor account has been created. Please use your email to log into your account:\n\nRegards,\nABC Company Team`;
      await sendMail(email, mailSubject, mailMessage); // Use the lowercase email

      // Respond with success message and sub-admin details
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

      if (!vlcCode) {
        return res.status(400).json({ error: "vlcCode is required" });
      }

      const uploadedOn = new Date();

      // Check if asset already exists
      let existingAsset = await AssetsReportModel.findOne({ vlcCode });

      if (existingAsset) {
        return res.status(409).json({
          message:
            "Assets record with this vlcCode already exists. Please edit the existing record.",
          data: existingAsset,
        });
      }

      // Normalize DPS field (split by comma, trim spaces)
      let dpsValues = [];
      if (dps) {
        if (typeof dps === "string") {
          dpsValues = dps
            .split(",")
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
        } else if (Array.isArray(dps)) {
          dpsValues = dps
            .map((v) => v.toString().trim())
            .filter((v) => v.length > 0);
        }
      }

      if (dpsValues.length > 0) {
        // Get all assets that have some DPS value stored
        const possibleConflicts = await AssetsReportModel.find({
          dps: { $exists: true, $ne: "" },
        });

        let conflicts = [];

        possibleConflicts.forEach((asset) => {
          const assetDpsValues = asset.dps
            .split(",")
            .map((v) => v.trim())
            .filter((v) => v.length > 0);

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

      // If not present, create a new one
      const newAsset = new AssetsReportModel({
        uploadedOn,
        uploadedBy: req.user.id, // assuming `req.user` is populated
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
        history: [], // no history initially
      });

      await newAsset.save();
      return res.json({
        message: "New assets record created successfully ✅",
        data: newAsset,
      });
    } catch (error) {
      console.error("Error in addAssetsReport:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };

  // Update existing assets record & push old values into history
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

      if (!vlcCode) {
        return res.status(400).json({ error: "vlcCode is required" });
      }

      const changedOn = new Date();

      // Find the asset
      let existingAsset = await AssetsReportModel.findOne({ vlcCode });

      if (!existingAsset) {
        return res.status(404).json({
          message: "Assets record not found. Please create a new record first.",
        });
      }

      let isChanged = false;

      // Define fields that can be updated and should be checked for changes
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

      for (const field of updatableFields) {
        const newValue = req.body[field];
        const existingValue = existingAsset[field];

        // Only consider a change if a new value is provided in the request body
        // and it's not null/undefined
        if (newValue !== undefined && newValue !== null) {
          if (typeof existingValue === "number") {
            // For number fields, parse the new value and compare
            const parsedNewValue = parseFloat(newValue);
            // Check if parsedNewValue is a valid number and different from existing
            if (!isNaN(parsedNewValue) && parsedNewValue !== existingValue) {
              isChanged = true;
              break;
            }
          } else {
            // For string fields, trim and compare
            const trimmedNewValue = String(newValue).trim();
            const trimmedExistingValue = String(existingValue || "").trim(); // Ensure existingValue is treated as string, default to empty string if null/undefined

            if (trimmedNewValue !== trimmedExistingValue) {
              isChanged = true;
              break;
            }
          }
        }
      }

      if (!isChanged) {
        return res.status(400).json({
          message: "No changes detected. Please provide new values to update.",
        });
      }

      if (dps) {
        // Normalize DPS field (split by comma, trim spaces)
        let dpsValues = [];
        if (dps) {
          if (typeof dps === "string") {
            dpsValues = dps
              .split(",")
              .map((v) => v.trim())
              .filter((v) => v.length > 0);
          } else if (Array.isArray(dps)) {
            dpsValues = dps
              .map((v) => v.toString().trim())
              .filter((v) => v.length > 0);
          }
        }

        if (dpsValues.length > 0) {
          // Get all assets that have some DPS value stored, excluding the current asset being updated
          const possibleConflicts = await AssetsReportModel.find({
            dps: { $exists: true, $ne: "" },
            vlcCode: { $ne: existingAsset.vlcCode }, // Exclude the current asset's vlcCode
          });

          let conflicts = [];

          possibleConflicts.forEach((asset) => {
            const assetDpsValues = asset.dps
              .split(",")
              .map((v) => v.trim())
              .filter((v) => v.length > 0);

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
      }

      // Push current values into history before updating
      existingAsset.history.push({
        srNo: existingAsset.srNo,
        stockNo: existingAsset.stockNo,
        rt: existingAsset.rt,
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
        changedOn: changedOn,
      });

      // Update with new values
      existingAsset.srNo = srNo ?? existingAsset.srNo;
      existingAsset.stockNo = stockNo ?? existingAsset.stockNo;
      existingAsset.rt = rt ?? existingAsset.rt;
      existingAsset.duplicate = duplicate ?? existingAsset.duplicate;
      existingAsset.vlcName = vlcName ?? existingAsset.vlcName;
      existingAsset.status = status ?? existingAsset.status;
      existingAsset.cStatus = cStatus ?? existingAsset.cStatus;
      existingAsset.can = can ?? existingAsset.can;
      existingAsset.lid = lid ?? existingAsset.lid;
      existingAsset.pvc = pvc ?? existingAsset.pvc;
      existingAsset.dps = dps ?? existingAsset.dps;
      existingAsset.keyboard = keyboard ?? existingAsset.keyboard;
      existingAsset.printer = printer ?? existingAsset.printer;
      existingAsset.charger = charger ?? existingAsset.charger;
      existingAsset.stripper = stripper ?? existingAsset.stripper;
      existingAsset.solar = solar ?? existingAsset.solar;
      existingAsset.controller = controller ?? existingAsset.controller;
      existingAsset.ews = ews ?? existingAsset.ews;
      existingAsset.display = display ?? existingAsset.display;
      existingAsset.battery = battery ?? existingAsset.battery;
      existingAsset.bond = bond ?? existingAsset.bond;
      existingAsset.vspSign = vspSign ?? existingAsset.vspSign;

      await existingAsset.save();

      return res.json({
        message: "Assets record updated & history saved ✅",
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
}

export default SubAdminController;
