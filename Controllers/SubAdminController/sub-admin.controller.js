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
import mongoose from "mongoose";

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
    if (typeof email === "string") email = email.trim().toLowerCase();
    if (typeof phoneNumber === "string") phoneNumber = phoneNumber.trim();
    if (typeof addressLine === "string") addressLine = addressLine.trim();
    if (typeof city === "string") city = city.trim();
    if (typeof state === "string") state = state.trim();
    if (typeof pincode === "string") pincode = pincode.trim();

    // Route: must be present as string or number, and not empty/null/undefined
    if (
      typeof route !== "string" &&
      typeof route !== "number"
    ) {
      return res.status(400).json({
        message: "Route is required and must be a string or a number.",
      });
    }
    if (
      (typeof route === "string" && route.trim() === "") ||
      route === null
    ) {
      return res.status(400).json({
        message: "Route is required and cannot be empty.",
      });
    }
    // To avoid matching number-string mismatch in MongoDB, if route is numeric string, coerce to number type
    if (typeof route === "string" && /^\d+$/.test(route.trim())) {
      route = route.trim();
      const numericRoute = Number(route);
      // If route is all-digits, allow both string and number, store as number for uniformity, but keep original if non-numeric
      route = isNaN(numericRoute) ? route : numericRoute;
    } else if (typeof route === "string") {
      route = route.trim();
    }

    // Validate presence and type for all fields (except route, which may be string or number)
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
      !(typeof route === "string" ? route.trim().length > 0 : true) // disallow empty route string
    ) {
      return res.status(400).json({
        message: "All fields are required. Route must be a string or a number and non-empty.",
      });
    }

    // More specific field validations
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format." });
    }

    // Phone number validation (e.g., 10 digits, numeric, optionally country code)
    const phoneRegex = /^(\+\d{1,4}\s*)?\d{10}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        message:
          "Invalid phone number format. Must be 10 digits, optionally preceded by a country code (e.g., +1 1234567890 or 1234567890).",
      });
    }

    // Pincode validation (e.g., 6 digits, numeric)
    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(pincode)) {
      return res
        .status(400)
        .json({ message: "Invalid pincode format. Must be 6 digits." });
    }

    const vendorIdRegex = /^\d{6}$/;
    if (!vendorIdRegex.test(vendorId)) {
      return res
        .status(400)
        .json({ message: "Invalid vendorId format. Must be 6 digits." });
    }

    try {
      // Check if a vendor with this email already exists
      const existingVendor = await UserModel.findOne({
        email,
      });

      if (existingVendor) {
        return res
          .status(409)
          .json({ message: "A User with this email already exists." });
      }

      // Check if a vendor with this vendorId already exists
      const existingVendorWithId = await UserModel.findOne({
        vendorId,
        role: "Vendor",
      });

      if (existingVendorWithId) {
        return res
          .status(409)
          .json({ message: "Vendor with this vendor ID already exists." });
      }

      // Route must exist as either string or number in RoutesModel
      let existingRoute;
      if (typeof route === "number") {
        existingRoute = await RoutesModel.findOne({
          $or: [{ route: route }, { route: route.toString() }],
        });
      } else {
        // route is string
        // try both original string and its number version if numeric
        const numRoute = /^\d+$/.test(route) ? Number(route) : null;
        existingRoute = await RoutesModel.findOne({
          $or: [{ route: route }, ...(numRoute !== null ? [{ route: numRoute }] : [])],
        });
      }

      if (!existingRoute) {
        return res.status(400).json({
          message:
            "This route does not exist yet. Please create the route while onboarding a Supervisor.",
        });
      }

      // Create a new vendor instance, include the route (string or number)
      const newVendor = new UserModel({
        name,
        vendorId,
        email,
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
        route, // Store the route as string or number at the root level
      });

      // Save the new vendor to the database
      await newVendor.save();

      // Send the OTP to the vendor's email
      const mailSubject = "Welcome to ABC Company - Verify Your Vendor Account";
      const mailMessage = `Dear ${name},\n\nYour Vendor account has been created. Please use your email to log into your account:\n\nRegards,\nABC Company Team`;

      try {
        await sendMail(email, mailSubject, mailMessage);
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

  updateVendor = async (req, res) => {
    // Only SubAdmin can update vendors
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "Vendor ID is required." });
    }

    try {
      const {
        name,
        email,
        vendorId,
        phoneNo,
        address,
        route, // Route number or string
      } = req.body;

      // Find existing vendor
      const vendor = await UserModel.findOne({
        _id: id,
        onboardedBy: req.user.id,
        role: "Vendor",
      });

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found." });
      }

      // Validate fields
      if (name !== undefined && (!name || typeof name !== "string")) {
        return res
          .status(400)
          .json({ message: "Name is required and must be a string." });
      }
      if (email !== undefined) {
        if (!email || typeof email !== "string") {
          return res
            .status(400)
            .json({ message: "Email is required and must be a string." });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ message: "Invalid email format." });
        }
        // Check for email conflict with other vendors
        const emailConflict = await UserModel.findOne({
          _id: { $ne: vendor._id },
          onboardedBy: req.user.id,
          role: "Vendor",
          email: email,
        });
        if (emailConflict) {
          return res.status(400).json({
            message: `Email "${email}" is already assigned to another vendor.`,
          });
        }
      }
      if (vendorId !== undefined) {
        if (!vendorId || typeof vendorId !== "string") {
          return res
            .status(400)
            .json({ message: "Vendor ID is required and must be a string." });
        }
        // Vendor ID should be exactly 6 digits
        if (!/^\d{6}$/.test(vendorId)) {
          return res
            .status(400)
            .json({ message: "Vendor ID must be exactly 6 digits." });
        }
        // Check for vendorId conflict with other vendors
        const vendorIdConflict = await UserModel.findOne({
          _id: { $ne: vendor._id },
          onboardedBy: req.user.id,
          role: "Vendor",
          vendorId: vendorId,
        });
        if (vendorIdConflict) {
          return res.status(400).json({
            message: `Vendor ID "${vendorId}" is already assigned to another vendor.`,
          });
        }
      }
      if (phoneNo !== undefined) {
        if (!phoneNo || typeof phoneNo !== "string") {
          return res
            .status(400)
            .json({ message: "Phone Number is required and must be a string." });
        }
        // 10 digits or +91 followed by 10 digits
        if (
          !(
            /^\d{10}$/.test(phoneNo) ||
            (/^(\+91)\d{10}$/.test(phoneNo) && phoneNo.length === 13)
          )
        ) {
          return res.status(400).json({
            message:
              "Phone Number must be 10 digits or in the format +91XXXXXXXXXX.",
          });
        }
      }
      if (address !== undefined) {
        if (
          typeof address !== "object" ||
          address === null ||
          (!address.addressLine && !address.city && !address.state && !address.pincode)
        ) {
          return res.status(400).json({
            message:
              "If updating address, provide at least one field: addressLine, city, state, or pincode.",
          });
        }
      }
      if (route !== undefined) {
        if (
          route === null ||
          route === "" ||
          (typeof route !== "string" && typeof route !== "number")
        ) {
          return res
            .status(400)
            .json({ message: "Route must be a string or number." });
        }

        // Check if the route exists in the master route schema
        let normalizedRoute;
        if (typeof route === "string" && /^\d+$/.test(route)) {
          // convert numeric strings to number to support number or string matches
          normalizedRoute = Number(route);
        } else {
          normalizedRoute = route;
        }
        // Look for the route in RoutesModel
        const foundRoute = await RoutesModel.findOne({
          $or: [
            { route: normalizedRoute },
            { route: String(normalizedRoute) },
            { route: Number(normalizedRoute) },
          ],
        });
        if (!foundRoute) {
          return res.status(400).json({
            message: `Route "${route}" does not exist in the master route schema.`,
          });
        }

        // Check if the same route is already assigned to any other vendor
        // const existingVendorOnRoute = await UserModel.findOne({
        //   _id: { $ne: vendor._id },
        //   onboardedBy: req.user.id,
        //   role: "Vendor",
        //   $or: [
        //     { route: normalizedRoute },
        //     { route: String(normalizedRoute) },
        //     { route: Number(normalizedRoute) },
        //   ],
        // });
        // if (existingVendorOnRoute) {
        //   return res.status(400).json({
        //     message: `Route "${route}" is already assigned to another vendor.`,
        //   });
        // }
      }

      // Apply updates, only those fields that are provided in body
      if (name !== undefined) vendor.name = name;
      if (email !== undefined) vendor.email = email;
      if (vendorId !== undefined) vendor.vendorId = vendorId;
      if (phoneNo !== undefined) vendor.phoneNo = phoneNo;
      if (address !== undefined) {
        vendor.address = {
          ...vendor.address,
          ...(address.addressLine !== undefined && { addressLine: address.addressLine }),
          ...(address.city !== undefined && { city: address.city }),
          ...(address.state !== undefined && { state: address.state }),
          ...(address.pincode !== undefined && { pincode: address.pincode }),
        };
      }
      if (route !== undefined) vendor.route = route;

      await vendor.save();

      res.status(200).json({
        message: "Vendor updated successfully.",
        vendor: {
          id: vendor._id,
          name: vendor.name,
          vendorId: vendor.vendorId,
          email: vendor.email,
          phoneNo: vendor.phoneNo,
          address: vendor.address,
          route: vendor.route,
        },
      });
    } catch (error) {
      console.error("Error updating Vendor:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  /**
   * Disable a vendor (soft delete).
   * PATCH /api/sub-admin/disable-vendor/:id
   */
  /**
   * Enable or disable a vendor (soft delete/reactivate).
   * PATCH /api/sub-admin/enable-disable-vendor/:id
   * Expects body: { disabled: true/false }
   */
  enableDisableVendor = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    const { id } = req.params;
    const { disabled } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Vendor ID is required." });
    }

    if (typeof disabled !== "boolean") {
      return res.status(400).json({ message: "Field 'disabled' is required and must be a boolean." });
    }

    try {
      const vendor = await UserModel.findOne({
        _id: id,
        onboardedBy: req.user.id,
        role: "Vendor",
      });

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found." });
      }

      if (vendor.disabled === disabled) {
        return res.status(400).json({
          message: `Vendor is already ${disabled ? "disabled" : "enabled"}.`,
        });
      }

      vendor.disabled = disabled;
      await vendor.save();

      res.status(200).json({ message: `Vendor ${disabled ? "disabled" : "enabled"} successfully.` });
    } catch (error) {
      console.error(`Error ${disabled ? "disabling" : "enabling"} Vendor:`, error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  /**
   * Enable a vendor (reactivate previously disabled vendor).
   * PATCH /api/sub-admin/enable-vendor/:id
   */
  enableVendor = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "Vendor ID is required." });
    }

    try {
      const vendor = await UserModel.findOne({
        _id: id,
        onboardedBy: req.user.id,
        role: "Vendor",
      });

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found." });
      }

      if (!vendor.disabled) {
        return res.status(400).json({ message: "Vendor is already enabled." });
      }

      vendor.disabled = false;
      await vendor.save();

      res.status(200).json({ message: "Vendor enabled successfully." });
    } catch (error) {
      console.error("Error enabling Vendor:", error);
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
      routes, // Expecting routes as array (can be string or number)
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

    // Validate presence and type for all fields (including routes array)
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
      !Array.isArray(routes) ||
      routes.length === 0
    ) {
      return res.status(400).json({
        message:
          "All fields are required and must be valid. 'routes' must be a non-empty array.",
      });
    }

    // Accept routes as string or number; remove blanks and normalize whitespace
    routes = routes
      .map((r) => {
        if (typeof r === "string") {
          const trimmed = r.trim();
          // If blank after trimming, skip it
          if (!trimmed) return null;
          // Try to convert to number if it's numeric, else use as string
          const maybeNum = Number(trimmed);
          return !isNaN(maybeNum) && trimmed === maybeNum.toString()
            ? maybeNum
            : trimmed;
        } else if (typeof r === "number") {
          return r;
        }
        // else skip (not string or number)
        return null;
      })
      .filter((r) => r !== null && r !== undefined && r !== "");

    if (routes.length === 0) {
      return res.status(400).json({
        message:
          "Supervisor must be assigned at least one valid route (number or string).",
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
        // role: "Supervisor",
      });

      if (existingSupervisor) {
        return res
          .status(409)
          .json({ message: "A User with this email already exists." });
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

      // Check if any of the requested routes already has a supervisor assigned
      const existingSupervisorWithRoute = await UserModel.findOne({
        supervisorRoutes: { $in: routes },
        role: "Supervisor",
        onboardedBy: req.user.id,
      });

      if (existingSupervisorWithRoute) {
        return res.status(409).json({
          message: "A route you selected is already assigned to a supervisor.",
        });
      }

      // // Save any new routes to RouteModel if they don't already exist
      // try {
      //   for (const routeNo of routes) {
      //     const existingRoute = await RoutesModel.findOne({ route: routeNo });
      //     if (!existingRoute) {
      //       const newRoute = new RoutesModel({ route: routeNo });
      //       await newRoute.save();
      //     }
      //   }
      // } catch (routeError) {
      //   console.error("Error saving route to RouteModel:", routeError);
      //   // Do not block onboarding if this fails
      // }

      // Create a new supervisor instance, including supervisorRoues: routes array
      const newSupervisor = new UserModel({
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
        supervisorRoutes: routes, // Save array of route numbers or strings!
        onboardedBy: req.user.id,
      });

      // Save the new supervisor to the database
      await newSupervisor.save();

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

      // Respond with success message and supervisor details, include supervisorRoues
      res.status(201).json({
        message: "Supervisor onboarded successfully. Mail sent to Supervisor.",
        subAdmin: {
          id: newSupervisor._id,
          name: newSupervisor.name,
          supervisorId: newSupervisor.supervisorId,
          email: newSupervisor.email,
          phoneNo: newSupervisor.phoneNo,
          role: newSupervisor.role,
          address: newSupervisor.address,
          supervisorRoutes: newSupervisor.supervisorRoutes,
        },
      });
    } catch (error) {
      console.error("Error onboarding supervisor:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  updateSupervisor = async (req, res) => {
    const { id } = req.params;
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const {
        name,
        email,
        supervisorId,
        phoneNo,
        address,
        supervisorRoutes, // Array of route numbers or strings
      } = req.body;

      if (!id) {
        return res.status(400).json({ message: "Supervisor ID is required." });
      }

      // Validate required fields (as in onboardSupervisor, require all except id to update)
      // Note: To support partial updates, only validate fields if they're being updated.
      if (name !== undefined && (!name || typeof name !== "string")) {
        return res.status(400).json({ message: "Supervisor name is required and must be a string." });
      }
      if (email !== undefined) {
        if (!email || typeof email !== "string") {
          return res.status(400).json({ message: "Supervisor email is required and must be a string." });
        }
        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ message: "Invalid email format." });
        }
      }
      if (supervisorId !== undefined) {
        if (!supervisorId || typeof supervisorId !== "string") {
          return res.status(400).json({ message: "Supervisor ID is required and must be a string." });
        }
        // Validate supervisorId should be 6 digits
        if (!/^\d{6}$/.test(supervisorId)) {
          return res.status(400).json({ message: "Supervisor ID must be a 6-digit number." });
        }
      }
      if (phoneNo !== undefined) {
        if (!phoneNo || typeof phoneNo !== "string") {
          return res.status(400).json({ message: "Phone Number is required and must be a string." });
        }
        // Accept phone numbers that are either:
        // - 10 digits (Indian mobile, e.g. 9876543210)
        // - start with +91 and followed by exactly 10 digits (e.g. +919876543210)
        if (
          !/^(?:\+91)?[6-9]\d{9}$/.test(phoneNo)
        ) {
          return res.status(400).json({ message: "Invalid phone number format. Please enter a valid 10-digit number with or without +91." });
        }
      }
      if (address !== undefined) {
        if (typeof address !== "object" || address === null) {
          return res.status(400).json({ message: "Address must be an object." });
        }
        // Validate all address fields only if they are being updated (partial update support)
        if ('addressLine' in address && (address.addressLine === undefined || typeof address.addressLine !== "string")) {
          return res.status(400).json({ message: "Address line must be a string." });
        }
        if ('city' in address && (address.city === undefined || typeof address.city !== "string")) {
          return res.status(400).json({ message: "City must be a string." });
        }
        if ('state' in address && (address.state === undefined || typeof address.state !== "string")) {
          return res.status(400).json({ message: "State must be a string." });
        }
        if ('pincode' in address && (address.pincode === undefined || typeof address.pincode !== "string")) {
          return res.status(400).json({ message: "Pincode must be a string." });
        }
      }
      let normalizedSupervisorRoutes;
      if (supervisorRoutes !== undefined) {
        if (!Array.isArray(supervisorRoutes)) {
          return res.status(400).json({ message: "supervisorRoutes must be an array." });
        }
        if (supervisorRoutes.length === 0) {
          return res.status(400).json({ message: "At least one route must be assigned to the supervisor." });
        }
        // Each element must be a string or a number, not undefined/null
        normalizedSupervisorRoutes = supervisorRoutes.map((r) => {
          if (r === undefined || r === null || (typeof r !== "string" && typeof r !== "number")) {
            return false; // Mark as invalid, will check below
          }
          // Normalize as string/number exactly for comparison against schema
          if (typeof r === "string") {
            const trimmed = r.trim();
            // Try to convert numeric strings to number
            if (!isNaN(Number(trimmed)) && trimmed === String(Number(trimmed))) {
              return Number(trimmed);
            }
            return trimmed;
          }
          return r;
        });
        if (normalizedSupervisorRoutes.includes(false)) {
          return res.status(400).json({ message: "Each route must be a string or a number." });
        }
      }

      // Find the supervisor by id and onboardedBy & role, to ensure subadmin only edits their own
      const supervisor = await UserModel.findOne({
        _id: id,
        onboardedBy: req.user.id,
        role: "Supervisor",
      });

      if (!supervisor) {
        return res.status(404).json({ message: "Supervisor not found." });
      }

      // --- Uniqueness Checks: email, supervisorId, phoneNo ---
      if (email !== undefined && email !== supervisor.email) {
        const existsWithSameEmail = await UserModel.findOne({
          _id: { $ne: id },
          onboardedBy: req.user.id,
          role: "Supervisor",
          email: email,
        });
        if (existsWithSameEmail) {
          return res.status(400).json({ message: "A supervisor with this email already exists." });
        }
      }
      if (supervisorId !== undefined && supervisorId !== supervisor.supervisorId) {
        const existsWithSameSupervisorId = await UserModel.findOne({
          _id: { $ne: id },
          onboardedBy: req.user.id,
          role: "Supervisor",
          supervisorId: supervisorId,
        });
        if (existsWithSameSupervisorId) {
          return res.status(400).json({ message: "A supervisor with this Supervisor ID already exists." });
        }
      }
      // --- END uniqueness checks ---

      // Validate routes exist in schema route
      if (Array.isArray(normalizedSupervisorRoutes) && normalizedSupervisorRoutes.length > 0) {
        // Get all schema routes
        const allSchemaRoutes = await RoutesModel.find({}).select("route -_id");
        // Map all to both string and number forms for robust matching
        const validRouteSet = new Set();
        for (const r of allSchemaRoutes) {
          if (r.route !== undefined && r.route !== null) {
            validRouteSet.add(String(r.route));
            // If it's a number (as a string), also add number (or vice versa)
            if (!isNaN(Number(r.route))) {
              validRouteSet.add(Number(r.route));
            }
          }
        }
        const notFoundRoutes = [];
        for (const testR of normalizedSupervisorRoutes) {
          if (!validRouteSet.has(testR) && !validRouteSet.has(String(testR)) && !validRouteSet.has(Number(testR))) {
            notFoundRoutes.push(testR);
          }
        }
        if (notFoundRoutes.length > 0) {
          return res.status(400).json({
            message: `Some route(s) do not exist in the master route list in schema: ${notFoundRoutes.join(", ")}`
          });
        }
      }

      // Check if any of the routes in supervisorRoutes are already assigned to another supervisor
      if (Array.isArray(normalizedSupervisorRoutes) && normalizedSupervisorRoutes.length > 0) {
        const routeSet = new Set();
        normalizedSupervisorRoutes.forEach(r => {
          routeSet.add(String(r));
          if (!isNaN(Number(r))) {
            routeSet.add(Number(r));
          }
        });

        const conflictSupervisors = await UserModel.find({
          _id: { $ne: id },
          onboardedBy: req.user.id,
          role: "Supervisor",
          supervisorRoutes: { $in: Array.from(routeSet) }
        });

        // Find which specific routes are in conflict (assigned to other supervisors)
        let conflictingRoutes = [];
        conflictSupervisors.forEach(sup => {
          if (Array.isArray(sup.supervisorRoutes)) {
            for (let route of sup.supervisorRoutes) {
              if (routeSet.has(route) || routeSet.has(String(route)) || routeSet.has(Number(route))) {
                conflictingRoutes.push(route);
              }
            }
          }
        });

        conflictingRoutes = [...new Set(conflictingRoutes)];

        if (conflictingRoutes.length > 0) {
          return res.status(400).json({
            message: `Some route(s) are already assigned to another supervisor: ${conflictingRoutes.join(", ")}`
          });
        }
      }

      // Only update supplied fields
      if (name !== undefined) supervisor.name = name;
      if (email !== undefined) supervisor.email = email;
      if (supervisorId !== undefined) supervisor.supervisorId = supervisorId;
      if (phoneNo !== undefined) supervisor.phoneNo = phoneNo;
      if (address !== undefined) {
        supervisor.address = {
          ...supervisor.address,
          ...(address.addressLine !== undefined && { addressLine: address.addressLine }),
          ...(address.city !== undefined && { city: address.city }),
          ...(address.state !== undefined && { state: address.state }),
          ...(address.pincode !== undefined && { pincode: address.pincode }),
        };
      }
      if (Array.isArray(normalizedSupervisorRoutes)) {
        supervisor.supervisorRoutes = normalizedSupervisorRoutes;
      }

      await supervisor.save();

      res.status(200).json({
        message: "Supervisor updated successfully.",
        supervisor: {
          id: supervisor._id,
          name: supervisor.name,
          supervisorId: supervisor.supervisorId,
          email: supervisor.email,
          phoneNo: supervisor.phoneNo,
          address: supervisor.address,
          supervisorRoutes: supervisor.supervisorRoutes,
        },
      });
    } catch (error) {
      console.error("Error updating supervisor:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }

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
  
  // uploadExcelFile = async (req, res) => {
  //   if (req.user.role !== "SubAdmin") {
  //     return res.status(403).json({
  //       message: "Unauthorized: Only Sub Admins can perform this action.",
  //     });
  //   }

  //   try {
  //     if (!req.file) {
  //       return res.status(400).json({ error: "No file uploaded" });
  //     }

  //     const workbook = xlsx.readFile(req.file.path);
  //     const sheetName = workbook.SheetNames[0];
  //     const worksheet = workbook.Sheets[sheetName];

  //     // Convert to JSON
  //     const rawData = xlsx.utils.sheet_to_json(worksheet, { range: 5 });

  //     const uploadedDate = new Date();

  //     // Utility: clean up keys + date
  //     const parseDate = (value) => {
  //       if (!value) return null;
  //       if (typeof value === "number") {
  //         // Excel serial date
  //         return xlsx.SSF.parse_date_code(value)
  //           ? new Date(
  //               xlsx.SSF.parse_date_code(value).y,
  //               xlsx.SSF.parse_date_code(value).m - 1,
  //               xlsx.SSF.parse_date_code(value).d
  //             )
  //           : null;
  //       }
  //       if (typeof value === "string") {
  //         // Convert "dd/mm/yyyy" -> proper Date
  //         const parts = value.split("/");
  //         if (parts.length === 3) {
  //           const [day, month, year] = parts.map((p) => parseInt(p, 10));
  //           return new Date(year, month - 1, day);
  //         }
  //         const parsed = new Date(value);
  //         return isNaN(parsed) ? null : parsed;
  //       }
  //       return null;
  //     };

  //     // Pick only required fields
  //     const filteredData = rawData.map((row) => {
  //       return {
  //         uploadedOn: uploadedDate,
  //         uploadedBy: req.user.id,
  //         docDate: parseDate(row[" Doc Date"]?.toString().trim()),
  //         shift: row["Shift"]?.toString().trim() || null,
  //         vlcUploaderCode: row["Vlc Uploader Code"]?.toString().trim() || null,
  //         vlcName: row["VLC Name"]?.toString().trim() || null,
  //         milkWeightLtr: parseFloat(row["Milk Weight(LTR)"]) || 0,
  //         fatPercentage: parseFloat(row[" FAT(%)"]) || 0,
  //         snfPercentage: parseFloat(row["SNF(%)"]) || 0,
  //       };
  //     });

  //     // Validate before saving (skip rows missing required fields)
  //     const validReports = filteredData.filter(
  //       (r) => r.docDate && r.shift && r.vlcUploaderCode && r.vlcName
  //     );

  //     if (!validReports.length) {
  //       return res.status(400).json({
  //         error: "No valid rows found in Excel (missing required fields).",
  //       });
  //     }

  //     await MilkReportModel.insertMany(validReports);

  //     res.json({
  //       message: "Excel data extracted & saved successfully ✅",
  //       rows: validReports,
  //       rowsLength: validReports.length,
  //     });

  //     // Optional cleanup
  //     // fs.unlinkSync(req.file.path);
  //   } catch (error) {
  //     console.error("Error reading Excel:", error);
  //     res.status(500).json({ error: "Failed to process Excel file" });
  //   }
  // };

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

      // --- Begin: Prevent duplicate upload for same docDate+shift by same user ---
      // Build a unique set of (docDate, shift) from this upload
      const keyTuples = new Set();
      validReports.forEach((r) => {
        if (r.docDate && r.shift) {
          // Only date, ignore time portion for comparison (set to start of day)
          const dateKey = (new Date(
            r.docDate.getFullYear(),
            r.docDate.getMonth(),
            r.docDate.getDate()
          )).toISOString();
          keyTuples.add(`${dateKey}|${r.shift}`);
        }
      });

      // For each unique (docDate, shift), check if already exists for this user
      const queries = Array.from(keyTuples).map(async (key) => {
        const [dateKey, shift] = key.split("|");
        const startOfDay = new Date(dateKey);
        const endOfDay = new Date(startOfDay);
        endOfDay.setHours(23, 59, 59, 999);

        // Check if *any* record by this user exists with same docDate (date only) + shift
        // For robustness, also match vlcUploaderCode
        const count = await MilkReportModel.countDocuments({
          uploadedBy: req.user.id,
          shift: shift,
          docDate: { $gte: startOfDay, $lte: endOfDay },
        });
        return { key, count };
      });

      const results = await Promise.all(queries);

      const duplicateErrKeys = results.filter((r) => r.count > 0).map((r) => r.key);

      if (duplicateErrKeys.length > 0) {
        // Pretty message of conflicting shifts/dates
        const conflicts = duplicateErrKeys.map((entry) => {
          const [d, s] = entry.split("|");
          // Format d as dd-mm-yyyy
          const dateObj = new Date(d);
          const dateStr = `${String(dateObj.getDate()).padStart(2, "0")}-${String(
            dateObj.getMonth() + 1
          ).padStart(2, "0")}-${dateObj.getFullYear()}`;
          return `Date: ${dateStr}, Shift: ${s}`;
        });

        // Conflicts were already declared above; just reuse and format for error message and details.
        return res.status(400).json({
          error: `Duplicate upload detected for: ${conflicts.join(", ")}`,
          conflicts: duplicateErrKeys.map((entry) => {
            const [dateIso, shift] = entry.split("|");
            const dateObj = new Date(dateIso);
            const dateStr = `${String(dateObj.getDate()).padStart(2, "0")}-${String(
              dateObj.getMonth() + 1
            ).padStart(2, "0")}-${dateObj.getFullYear()}`;
            return { date: dateStr, shift };
          }),
        });
      }

      // --- End: Prevent duplicate upload for same docDate+shift by same user ---

      // But also: Prevent more than two uploads per day per user (two different shifts allowed, nothing else)
      // After checking above, now check for this day how many shifts will be present after upload

      // Build a map: { dateKey: Set of shifts for that user in DB Already }
      const dateShiftMap = {};

      for (let key of keyTuples) {
        const [dateKey, ] = key.split("|");
        // Ignore time, just date
        if (!dateShiftMap[dateKey]) {
          // Find how many distinct shifts exist in DB for that date and user
          const allShifts = await MilkReportModel.find({
            uploadedBy: req.user.id,
            docDate: {
              $gte: new Date(dateKey),
              $lte: new Date(new Date(dateKey).setHours(23,59,59,999))
            }
          }).distinct('shift');
          dateShiftMap[dateKey] = new Set(allShifts); // from DB
        }
      }

      // Now, for this upload, see for each dateKey how many shifts will be in DB after this upload
      // (including what is about to be uploaded)
      for (let key of keyTuples) {
        const [dateKey, shift] = key.split("|");
        // capture existing shifts for this dateKey
        const shiftSet = new Set(dateShiftMap[dateKey] || []);
        shiftSet.add(shift); // add shift from this upload
        if (shiftSet.size > 2) {
          // Impossible: more than 2 shifts ("Morning" and "Evening") uploads not allowed
          const dateObj = new Date(dateKey);
          const dateStr = `${String(dateObj.getDate()).padStart(2, "0")}-${String(
            dateObj.getMonth() + 1
          ).padStart(2, "0")}-${dateObj.getFullYear()}`;
          return res.status(400).json({
            error: "Upload failed: For the same date, only two Excel files can be uploaded (one Morning and one Evening). You are exceeding this for:",
            conflict: `Date: ${dateStr}`
          });
        }
      }

      await MilkReportModel.insertMany(validReports);

      res.json({
        message: "Excel data extracted & saved successfully ✅",
        rows: validReports,
        rowsLength: validReports.length,
      });

      // Optional: fs.unlinkSync(req.file.path);
    } catch (error) {
      console.error("Error reading Excel:", error);
      res.status(500).json({ error: "Failed to process Excel file" });
    }
  };

  manualMilkReportEntry = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        error: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const {
        docDate,
        shift,
        vlcUploaderCode,
        vlcName,
        milkWeightLtr,
        fatPercentage,
        snfPercentage,
      } = req.body;

      // Validate required fields
      if (
        !docDate ||
        !shift ||
        !vlcUploaderCode ||
        !vlcName ||
        milkWeightLtr === undefined ||
        fatPercentage === undefined ||
        snfPercentage === undefined
      ) {
        return res.status(400).json({
          error: "Please fill all required fields in the form.",
        });
      }

      // Only allow "Morning" or "Evening" for shift
      const allowedShifts = ["Morning", "Evening"];
      if (!allowedShifts.includes(shift)) {
        return res.status(400).json({
          error: "Allowed Shift values are 'Morning' or 'Evening'.",
        });
      }

      // Parse docDate (expect "YYYY-MM-DD" or ISO format)
      const docDateObj = new Date(docDate);
      if (isNaN(docDateObj.getTime())) {
        return res.status(400).json({
          error: "Invalid date format for 'docDate'. Use YYYY-MM-DD.",
        });
      }

      // Save the entry
      const report = await MilkReportModel.create({
        uploadedOn: new Date(),
        uploadedBy: req.user.id,
        docDate: docDateObj,
        shift,
        vlcUploaderCode: vlcUploaderCode.trim(),
        vlcName: vlcName.trim(),
        milkWeightLtr: Number(milkWeightLtr),
        fatPercentage: Number(fatPercentage),
        snfPercentage: Number(snfPercentage),
      });

      return res.status(201).json({
        message: "Milk report entry saved successfully.",
        data: report,
      });
    } catch (error) {
      console.error("Error in manualMilkReportEntry:", error);
      return res.status(500).json({ error: "Failed to save manual entry." });
    }
  };

  getUploadedMilkReport = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const { page = 1, limit = 10, search = "", startDate = "", endDate = "", shift = "" } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const userId = req.user.id;
      const searchText = (search || "").trim();

      // Build MongoDB query
      const baseMatch = { uploadedBy: userId };
      // Add shift filter (if set and not "All")
      if (shift && shift !== "All") {
        baseMatch.shift = shift;
      }
      // Add startDate/endDate filter (docDate field)
      if (startDate && endDate) {
        baseMatch.docDate = {
          $gte: new Date(startDate),
          $lte: new Date(endDate + "T23:59:59.999Z"),
        };
      } else if (startDate) {
        baseMatch.docDate = { $gte: new Date(startDate) };
      } else if (endDate) {
        baseMatch.docDate = { $lte: new Date(endDate + "T23:59:59.999Z") };
      }

      let searchOr = [];

      if (searchText !== "") {
        // Escape regex special chars
        const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "i"); // Case-insensitive

        // Try normalizing searchText as a date in "YYYY-MM-DD" format for comparison with date fields
        let normalizedDate = null;
        // Accepts DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY, etc.
        // We'll normalize to YYYY-MM-DD string for comparisons
        if (
          /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(searchText) || // DD-MM-YYYY or DD/MM/YYYY
          /^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(searchText)    // YYYY-MM-DD or YYYY/MM/DD
        ) {
          let parts;
          if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(searchText)) {
            // DD-MM-YYYY or DD/MM/YYYY
            parts = searchText.split(/[\-\/]/);
            normalizedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          } else if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(searchText)) {
            // YYYY-MM-DD or YYYY/MM/DD
            parts = searchText.split(/[\-\/]/);
            normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          }
        }

        //console.log(normalizedDate);

        searchOr = [
          { shift: regex },
          { vlcUploaderCode: regex },
          { vlcName: regex },
          { edited: searchText.toLowerCase() === "true" ? true : searchText.toLowerCase() === "false" ? false : undefined },

          // Dates as string, normalized search
          ...(normalizedDate
            ? [{
                $expr: {
                  $eq: [
                    { $dateToString: { format: "%Y-%m-%d", date: "$docDate" } },
                    normalizedDate
                  ]
                }
              }]
            : [{
                $expr: {
                  $regexMatch: {
                    input: { $dateToString: { format: "%Y-%m-%d", date: "$docDate" } },
                    regex: escaped,
                    options: "i"
                  }
                }
              }]
          ),

          // Numeric fields as "string search"
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$milkWeightLtr" },
                regex: escaped,
                options: "i"
              }
            }
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$fatPercentage" },
                regex: escaped,
                options: "i"
              }
            }
          },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$snfPercentage" },
                regex: escaped,
                options: "i"
              }
            }
          }
        ];

        // Remove undefined matches (in edited above)
        searchOr = searchOr.filter(f => {
          if (typeof f.edited === "undefined") return !(f.hasOwnProperty("edited"));
          return true;
        });
      }

      const query = searchOr.length > 0
        ? { ...baseMatch, $or: searchOr }
        : baseMatch;

      const [milkReports, totalReports] = await Promise.all([
        MilkReportModel.find(query)
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ uploadedOn: -1 }),
        MilkReportModel.countDocuments(query)
      ]);

      return res.status(200).json({
        message: "Milk reports fetched successfully ✅",
        data: milkReports,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalReports / parseInt(limit)),
        totalReports: totalReports,
      });
    } catch (error) {
      console.error("Error in getUploadedMilkReport:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };



  updateMilkReport = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    // Now allowing vlcUploaderCode to be updated as well
    const allowedFields = [
      "docDate",
      "shift",
      "vlcName",
      "milkWeightLtr",
      "fatPercentage",
      "snfPercentage",
      "vlcUploaderCode",
    ];

    try {
      const { id } = req.params; // assume :id as MilkReport _id
      if (!id) {
        return res.status(400).json({ message: "Milk report ID is required." });
      }

      // Pick allowed fields from body
      const updates = {};
      for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) {
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res
          .status(400)
          .json({ message: "No valid fields submitted for update." });
      }

      const milkReport = await MilkReportModel.findById(id);
      if (!milkReport) {
        return res.status(404).json({ message: "Milk report not found." });
      }

      // Save old values for history, including vlcUploaderCode
      const historyEntry = {};
      for (const field of allowedFields) {
        historyEntry[field] = milkReport[field];
      }
      // Record docDate in history (can be useful even if not changed)
      historyEntry.docDate = milkReport.docDate;

      // Add editedOn time (Date) for this update
      const editedOnDate = new Date();
      historyEntry.editedOn = editedOnDate;

      milkReport.history = milkReport.history || [];
      milkReport.history.push(historyEntry);

      // Update the fields
      for (const field in updates) {
        milkReport[field] = updates[field];
      }
      milkReport.edited = true;

      await milkReport.save();

      res.status(200).json({
        message: "Milk report updated successfully ✅",
        data: milkReport,
      });
    } catch (error) {
      console.error("Error updating milk report:", error);
      res.status(500).json({ message: "Failed to update milk report" });
    }
  };

  // Delete MilkReport record by MilkReportId
  deleteMilkreport = async (req, res) => {
    try {
      const { id } = req.params; // Expecting MilkReportId as a URL param
      if (!id) {
        return res.status(400).json({ message: "MilkReportId is required." });
      }

      const milkReport = await MilkReportModel.findById(id);
      if (!milkReport) {
        return res.status(404).json({ message: "Milk report not found." });
      }

      await MilkReportModel.findByIdAndDelete(id);

      return res.status(200).json({
        message: "Milk report deleted successfully ✅",
        data: milkReport,
      });
    } catch (error) {
      console.error("Error deleting milk report:", error);
      return res.status(500).json({ message: "Failed to delete milk report." });
    }
  };

  /**
   * Bulk delete all milk reports for a given date and shift.
   * Expects: req.body = { date: "YYYY-MM-DD" or date-string, shift: "" | "Morning" | "Evening" }
   */
  bulkDeleteMilkReports = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const { date, shift } = req.body;

      // Validate fields
      if (!date || !shift) {
        return res.status(400).json({
          error: "Both date and shift are required.",
        });
      }
      const normalizedShift = shift === "Morning" || shift === "Evening" ? shift : null;
      if (!normalizedShift) {
        return res.status(400).json({
          error: "Shift must be either 'Morning' or 'Evening'.",
        });
      }

      // Parse date like docDate in the sales version
      let dateObj;
      if (typeof date === "string") {
        // Accept YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY
        let parts;
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          // YYYY-MM-DD
          parts = date.split("-");
          dateObj = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
        } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
          // DD/MM/YYYY
          parts = date.split("/");
          dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        } else if (/^\d{2}-\d{2}-\d{4}$/.test(date)) {
          // DD-MM-YYYY
          parts = date.split("-");
          dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        } else {
          dateObj = new Date(date);
        }
      } else {
        dateObj = new Date(date);
      }
      if (isNaN(dateObj.getTime())) {
        return res.status(400).json({ error: "Invalid 'date' format." });
      }

      // Find all matching milk reports for the logged-in SubAdmin with that docDate (ignoring time) and shift
      const startOfDay = new Date(dateObj.setHours(0, 0, 0, 0));
      const endOfDay = new Date(dateObj.setHours(23, 59, 59, 999));

      const query = {
        uploadedBy: req.user.id,
        shift: normalizedShift,
        docDate: { $gte: startOfDay, $lte: endOfDay },
      };

      const toDelete = await MilkReportModel.find(query);
      if (!toDelete.length) {
        return res.status(404).json({
          message: "No milk reports found for given date and shift.",
        });
      }

      const result = await MilkReportModel.deleteMany(query);

      return res.status(200).json({
        message: `Deleted ${result.deletedCount} milk report(s) for ${date} (${normalizedShift}).`,
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      console.error("Error in bulkDeleteMilkReports:", error);
      return res.status(500).json({ error: "Failed to perform bulk delete." });
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
      const { page = 1, limit = 10, search = "", startDate = "", endDate = "" } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const userId = req.user.id;
      const searchText = (search || "").trim();

      // Build MongoDB query
      const baseMatch = { uploadedBy: userId };

      // Add startDate/endDate filter (docDate field)
      if (startDate && endDate) {
        baseMatch.docDate = {
          $gte: new Date(startDate),
          $lte: new Date(endDate + "T23:59:59.999Z"),
        };
      } else if (startDate) {
        baseMatch.docDate = { $gte: new Date(startDate) };
      } else if (endDate) {
        baseMatch.docDate = { $lte: new Date(endDate + "T23:59:59.999Z") };
      }

      let searchOr = [];

      if (searchText !== "") {
        // Escape regex special chars
        const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "i"); // Case-insensitive

        // Try normalizing searchText as a date in "YYYY-MM-DD" format for comparison with date fields
        let normalizedDate = null;
        // Accepts DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY, etc.
        // We'll normalize to YYYY-MM-DD string for comparisons
        if (
          /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(searchText) || // DD-MM-YYYY or DD/MM/YYYY
          /^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(searchText)    // YYYY-MM-DD or YYYY/MM/DD
        ) {
          let parts;
          if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(searchText)) {
            // DD-MM-YYYY or DD/MM/YYYY
            parts = searchText.split(/[\-\/]/);
            normalizedDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
          } else if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(searchText)) {
            // YYYY-MM-DD or YYYY/MM/DD
            parts = searchText.split(/[\-\/]/);
            normalizedDate = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
          }
        }

        // For edited boolean search
        let editedValue;
        if (searchText.toLowerCase() === "true") editedValue = true;
        else if (searchText.toLowerCase() === "false") editedValue = false;

        searchOr = [
          { itemCode: regex },   // itemCode may be string or number/date, but search as string anyway
          { itemName: regex },
          { vlcUploaderCode: regex },
          { edited: typeof editedValue !== "undefined" ? editedValue : undefined },
          // Dates as string, normalized search, apply to docDate
          ...(normalizedDate
            ? [{
                $expr: {
                  $eq: [
                    { $dateToString: { format: "%Y-%m-%d", date: "$docDate" } },
                    normalizedDate,
                  ]
                }
              }]
            : [{
                $expr: {
                  $regexMatch: {
                    input: { $dateToString: { format: "%Y-%m-%d", date: "$docDate" } },
                    regex: escaped,
                    options: "i"
                  }
                }
              }]
          ),
          // Numeric fields as "string search"
          {
            $expr: {
              $regexMatch: {
                input: { $toString: "$quantity" },
                regex: escaped,
                options: "i"
              }
            }
          }
        ];

        // Remove undefined matches (in edited above)
        searchOr = searchOr.filter(f => {
          if (typeof f.edited === "undefined") return !(f.hasOwnProperty("edited"));
          return true;
        });
      }

      const query = searchOr.length > 0
        ? { ...baseMatch, $or: searchOr }
        : baseMatch;

      const [salesReport, totalReports] = await Promise.all([
        SalesReportModel.find(query)
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ uploadedOn: -1 }),
        SalesReportModel.countDocuments(query)
      ]);

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

  // ✅ Update a single sales report, saving history and updating 'edited' and 'editedOn' accordingly
  updateSalesReport = async (req, res) => {
    if (req.user.role !== "SubAdmin") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const { id } = req.params;
      const { itemCode, itemName, vlcUploaderCode, quantity, docDate } = req.body; // Accept vlcUploaderCode

      // Find the sales report document
      const salesReport = await SalesReportModel.findById(id);
      if (!salesReport) {
        return res.status(404).json({ error: "Sales report not found." });
      }

      // Create a history entry (all fields as defined in schema)
      const historyEntry = {
        itemCode: salesReport.itemCode,
        itemName: salesReport.itemName,
        vlcUploaderCode: salesReport.vlcUploaderCode,
        quantity: salesReport.quantity,
        docDate: salesReport.docDate,
        editedOn: new Date(),
      };

      // Push the history entry
      salesReport.history = salesReport.history || [];
      salesReport.history.push(historyEntry);

      // Update the fields
      if (itemCode !== undefined) salesReport.itemCode = itemCode;
      if (itemName !== undefined) salesReport.itemName = itemName;
      if (vlcUploaderCode !== undefined) salesReport.vlcUploaderCode = vlcUploaderCode;
      if (quantity !== undefined) salesReport.quantity = quantity;
      if (docDate !== undefined) salesReport.docDate = new Date(docDate);

      // Set edited flag
      salesReport.edited = true;

      await salesReport.save();

      res.status(200).json({
        message: "Sales report updated successfully. History entry created.",
        data: salesReport,
      });
    } catch (error) {
      console.error("Error in updateSalesReport:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  // Delete SalesReport record by SalesReportId
  deleteSalesreport = async (req, res) => {
    try {
      const { id } = req.params; // Expecting SalesReportId as a URL param
      if (!id) {
        return res.status(400).json({ message: "SalesReportId is required." });
      }

      const salesReport = await SalesReportModel.findById(id);
      if (!salesReport) {
        return res.status(404).json({ message: "Sales report not found." });
      }

      await SalesReportModel.findByIdAndDelete(id);

      return res.status(200).json({
        message: "Sales report deleted successfully ✅",
        data: salesReport,
      });
    } catch (error) {
      console.error("Error deleting sales report:", error);
      return res.status(500).json({ message: "Failed to delete sales report." });
    }
  };

  /**
   * Bulk delete all sales reports for a given date and shift.
   * Expects: req.body = { docDate: "YYYY-MM-DD" or date-string, shift: "" | "Morning" | "Evening" }
   */
 
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
    // We use a MongoDB session/transaction to guarantee atomicity!

    const session = await mongoose.startSession();
    session.startTransaction();

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
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ error: "vlcCode is required" });
      }

      const uploadedOn = new Date();

      // Check if asset already exists
      const existingAsset = await AssetsReportModel.findOne({ vlcCode }).session(session);
      if (existingAsset) {
        await session.abortTransaction();
        session.endSession();
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
      }).session(session);
      if (!issuedAssets) {
        await session.abortTransaction();
        session.endSession();
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
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: "Some DPS or Bond values are not issued to this sub-admin.",
          missing: { dps: missingDps, bond: missingBonds },
        });
      }

      // ✅ Step 3: DPS conflict check
      if (dpsValues.length > 0) {
        const possibleConflicts = await AssetsReportModel.find({
          dps: { $exists: true, $ne: "" },
        }).session(session);
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
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({
            message: "Some DPS values already exist in other asset records.",
            conflicts,
          });
        }
      }

      // ✅ Step 4: Check inventory availability
      const usedAssets = await UsedAssetsOfSubAdminModel.findOne({
        subAdminId,
      }).session(session);
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
          await session.abortTransaction();
          session.endSession();
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
      await newAsset.save({ session });

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

        await usedAssets.save({ session });
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
        await newUsed.save({ session });
      }

      // COMMIT TRANSACTION
      await session.commitTransaction();
      session.endSession();

      return res.json({
        message:
          "New asset record created and UsedAssets updated successfully ✅",
        data: newAsset,
      });
    } catch (error) {
      // Rollback ALL changes on any error
      try {
        await session.abortTransaction();
      } catch (err2) {
        // Ignore
      }
      session.endSession();
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
    // We want both AssetsReportModel and UsedAssetsOfSubAdminModel to update atomically.
    // We'll use a MongoDB session + transaction (requires MongoDB >=4.0, and Mongoose connection must be configured for transactions).

    // Helper to normalize comma-separated strings
    const parseCommaValues = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map((v) => v.trim()).filter(Boolean);
      return val
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    };

    const session = await mongoose.startSession();
    session.startTransaction();
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
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ error: "vlcCode is required" });
      }

      const changedOn = new Date();

      // Find the existing asset record (in transaction)
      let existingAsset = await AssetsReportModel.findOne({ vlcCode }).session(session);
      if (!existingAsset) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          message: "Assets record not found. Please create it first.",
        });
      }

      const dpsValues = parseCommaValues(dps);
      const bondValues = parseCommaValues(bond);
      const oldDpsValues = parseCommaValues(existingAsset.dps);
      const oldBondValues = parseCommaValues(existingAsset.bond);

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
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: "No changes detected. Provide new values to update.",
        });
      }

      // ================================
      // ✅ Step 2: DPS & Bond Validation (must exist in issued)
      // ================================
      const issuedAssets = await IssuedAssetsToSubAdminModel.findOne({
        subAdminId,
      }).session(session);
      if (!issuedAssets) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message:
            "No issued assets found for this sub-admin. Cannot validate update.",
        });
      }

      // ================================
      // 🚨 Step 2.1: Check if DPS/BOND to be updated are already present in used assets (error!)
      // ================================
      const usedAssets = await UsedAssetsOfSubAdminModel.findOne({
        subAdminId,
      }).session(session);

      // Only check for *extra* DPS/BOND, i.e. those not part of oldDpsValues/oldBondValues (for this asset)
      let usedDpsAlready = [];
      let usedBondAlready = [];
      if (usedAssets) {
        const usedDpsList = parseCommaValues(usedAssets.dps);
        const usedBondList = parseCommaValues(usedAssets.bond);

        // DPS values that are trying to be set in this update, that are already in usedAssets for this subadmin,
        // but were not previously part of this asset (so they would become 'used' twice through two assets)
        usedDpsAlready = dpsValues.filter(
          (val) => usedDpsList.includes(val) && !oldDpsValues.includes(val)
        );
        usedBondAlready = bondValues.filter(
          (val) => usedBondList.includes(val) && !oldBondValues.includes(val)
        );

        if (usedDpsAlready.length > 0 || usedBondAlready.length > 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({
            message:
              "Some DPS or Bond values are already present in used assets and cannot be assigned twice.",
            alreadyUsed: { dps: usedDpsAlready, bond: usedBondAlready },
          });
        }
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
        await session.abortTransaction();
        session.endSession();
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
        }).session(session);

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
          await session.abortTransaction();
          session.endSession();
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
        }).session(session);

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
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({
            message: "Some Bond values already exist in other asset records.",
            conflicts,
          });
        }
      }

      // ================================
      // 🔢 Step 4: Validate inventory (issued vs used)
      // ================================
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
          await session.abortTransaction();
          session.endSession();
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

      await existingAsset.save({ session });

      // ================================
      // 🔁 Step 7: Update UsedAssetsOfSubAdminModel (with correct old values)
      // ================================
      if (usedAssets) {
        // Update numeric fields in used assets
        numericFields.forEach((f) => {
          const oldVal = oldNumericValues[f];
          const newVal = Number(req.body[f] ?? oldVal);
          const diff = newVal - oldVal;

          if (!isNaN(diff) && diff !== 0) {
            usedAssets[f] = (usedAssets[f] || 0) + diff;
          }
        });

        // Clamp negative values to zero
        numericFields.forEach((f) => {
          usedAssets[f] = Math.max(0, usedAssets[f]);
        });

        // --- DPS and BOND removal from used assets if removed in the update ---
        // DPS: Remove entries that were previously there but are now missing
        let existingDps = parseCommaValues(usedAssets.dps);
        let existingBond = parseCommaValues(usedAssets.bond);

        // Find DPS values that were previously part of this vlcCode's asset, but now have been removed
        // Remove only the ones from *this* asset that are no longer in dpsValues
        const removedDps = oldDpsValues.filter(
          (val) => !dpsValues.includes(val)
        );
        const removedBond = oldBondValues.filter(
          (val) => !bondValues.includes(val)
        );

        // Remove deleted DPS from usedAssets.dps
        if (removedDps.length > 0) {
          existingDps = existingDps.filter((x) => !removedDps.includes(x));
        }
        // Remove deleted Bond from usedAssets.bond
        if (removedBond.length > 0) {
          existingBond = existingBond.filter((x) => !removedBond.includes(x));
        }

        // Add new DPS & BOND if any
        // (keep union, so system can't "un-use" a DPS or BOND from other assets)
        existingDps = Array.from(new Set([...existingDps, ...dpsValues]));
        existingBond = Array.from(new Set([...existingBond, ...bondValues]));

        usedAssets.dps = existingDps.join(",");
        usedAssets.bond = existingBond.join(",");

        usedAssets.history.push({ changedOn });
        await usedAssets.save({ session });
      }

      // COMMIT TRANSACTION
      await session.commitTransaction();
      session.endSession();

      return res.json({
        message: "Assets record updated successfully ✅",
        data: existingAsset,
      });
    } catch (error) {
      // ROLLBACK TRANSACTION ON ERROR
      try {
        await session.abortTransaction();
      } catch (err2) {
        // log/ignore
      }
      session.endSession();
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
          message: "Assets are not yet issued to this SubAdmin",
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

  editMilkReport = async (req, res) => {
    try {
      // Validate _id presence
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ message: "Milk Report ID is required." });
      }

      // Get update object from request body
      const updateData = req.body;
      if (!updateData || Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No update data provided." });
      }

      // Update milk report document
      const updatedMilkReport = await MilkReportModel.findByIdAndUpdate(
        id,
        updateData,
        { new: true }
      );

      if (!updatedMilkReport) {
        return res.status(404).json({ message: "Milk Report not found." });
      }

      return res.status(200).json({
        message: "Milk Report updated successfully.",
        data: updatedMilkReport,
      });
    } catch (error) {
      console.error("Error updating Milk Report:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
}

export default SubAdminController;
