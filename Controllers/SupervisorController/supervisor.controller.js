import xlsx from "xlsx";
import fs from "fs";
import MilkReportModel from "../../Schema/milk.report.schema.js";
import SalesReportModel from "../../Schema/sales.report.schema.js";
import AssetsReportModel from "../../Schema/assets.report.schema.js";
import UserModel from "../../Schema/user.schema.js";
import sendMail from "../../config/nodeMailer.config.js";
import IssuedAssetsToSubAdminModel from "../../Schema/issued.assets.subadmin.schema.js";
import UsedAssetsOfSubAdminModel from "../../Schema/used.assets.vendor.schema.js";

class SupervisorController {
  getProfileDetails = async (req, res) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const supervisor = await UserModel.findById(req.user.id).select(
        "-password -otp -otpExpires -__v"
      );
      if (!supervisor) {
        return res.status(404).json({ message: "Supervisor not found" });
      }
      res.status(200).json({
        message: "Supervisor profile fetched successfully.",
        profile: supervisor,
      });
    } catch (error) {
      console.error("Error fetching supervisor profile:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };
  
  getDashboardDetails = async (req, res) => {
    if (req.user.role !== "Supervisor") {
      return res.status(403).json({
        message: "Unauthorized: Only Supervisor can perform this action.",
      });
    }

    try {
      // First, find the supervisor's route
      const supervisor = await UserModel.findById(req.user.id).select("route");

      if (!supervisor || !supervisor.route) {
        return res.status(400).json({
          message: "Supervisor's route information not found.",
        });
      }
      const allVendorsCount = await UserModel.countDocuments({
        role: "Vendor",
        route: supervisor.route,
      });

      // Sum up all the milkWeightLtr uploaded by SubAdmin
      // Find all vendors whose route matches the supervisor's route, then sum milkWeightLtr where vlcUploaderCode is one of those vendorIds
      const vendorIds = await UserModel.find({
        role: "Vendor",
        route: supervisor.route,
      }).distinct("vendorId");
      const totalMilkWeightLtr = await MilkReportModel.aggregate([
        { $match: { vlcUploaderCode: { $in: vendorIds } } },
        { $group: { _id: null, total: { $sum: "$milkWeightLtr" } } },
      ]);

      const milkWeightSum =
        totalMilkWeightLtr.length > 0 ? totalMilkWeightLtr[0].total : 0;

      res.status(200).json({
        message: "Dashboard details fetched successfully.",
        allVendorsCount,
        milkWeightSum,
      });
    } catch (error) {
      console.error("Error fetching dashboard details:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };

  getAllVendors = async (req, res) => {
    if (req.user.role !== "Supervisor") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      // Get the supervisor's route (assuming `route` is stored on user profile)
      // Some systems may store route as "route", "routes", or as part of an object-- adjust if needed
      const supervisor = await UserModel.findById(req.user.id).select("route");
      if (!supervisor || !supervisor.route) {
        return res.status(400).json({
          message: "Supervisor's route information not found.",
        });
      }
      const route = supervisor.route;

      const vendors = await UserModel.find({
        route: route,
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

  getUploadedMilkReport = async (req, res) => {
    if (req.user.role !== "Supervisor") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const supervisor = await UserModel.findById(req.user.id).select("route");
      if (!supervisor || !supervisor.route) {
        return res.status(400).json({
          message: "Supervisor's route information not found.",
        });
      }
      const route = supervisor.route;

      // Fetch all vendors whose route matches the supervisor's route
      const vendors = await UserModel.find({
        route: route,
        role: "Vendor",
      }).select("-password -otp -otpExpires -__v");

      // Fetch vendors whose route matches the supervisor's route and get their vendorIds
      const vendorIds = vendors.map((vendor) => vendor.vendorId);

      // Fetch milk reports where vlcUploaderCode matches any of the vendorIds
      const milkReports = await MilkReportModel.find({
        vlcUploaderCode: { $in: vendorIds },
      })
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ uploadedOn: -1 }); // Sort by most recent upload first

      console.log(milkReports);

      const totalReports = await MilkReportModel.countDocuments({
        vlcUploaderCode: { $in: vendorIds },
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

  getUploadedSalesReport = async (req, res) => {
    if (req.user.role !== "Supervisor") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const supervisor = await UserModel.findById(req.user.id).select("route");
      if (!supervisor || !supervisor.route) {
        return res.status(400).json({
          message: "Supervisor's route information not found.",
        });
      }
      const route = supervisor.route;

      // Fetch all vendors whose route matches the supervisor's route
      const vendors = await UserModel.find({
        route: route,
        role: "Vendor",
      }).select("-password -otp -otpExpires -__v");

      // Fetch vendors whose route matches the supervisor's route and get their vendorIds
      const vendorIds = vendors.map((vendor) => vendor.vendorId);

      // Fetch all sales reports for all vendorIds on this supervisor's route
      const salesReport = await SalesReportModel.find({
        vlcUploaderCode: { $in: vendorIds },
      })
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ uploadedOn: -1 }); // Sort by most recent upload first

      const totalReports = await SalesReportModel.countDocuments({
        vlcUploaderCode: { $in: vendorIds },
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

  getUploadedAssetsReport = async (req, res) => {
    if (req.user.role !== "Supervisor") {
      return res.status(403).json({
        message: "Unauthorized: Only Sub Admins can perform this action.",
      });
    }

    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const userId = req.user.id;

      const supervisor = await UserModel.findById(req.user.id).select("route");
      if (!supervisor || !supervisor.route) {
        return res.status(400).json({
          message: "Supervisor's route information not found.",
        });
      }
      const route = supervisor.route;

      // Fetch all vendors whose route matches the supervisor's route
      const vendors = await UserModel.find({
        route: route,
        role: "Vendor",
      }).select("-password -otp -otpExpires -__v");

      // Fetch vendors whose route matches the supervisor's route and get their vendorIds
      const vendorIds = vendors.map((vendor) => vendor.vendorId);

      console.log(vendorIds);

      // Fetch assets reports for all vendors whose route matches the supervisor's route
      const assetsReport = await AssetsReportModel.find({
        vlcCode: { $in: vendorIds },
      })
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ uploadedOn: -1 }); // Sort by most recent upload first

      const totalReports = await AssetsReportModel.countDocuments({
        vlcCode: { $in: vendorIds },
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

  getAssetsReport = async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const userId = req.user.id;

      const supervisor = await UserModel.findById(req.user.id).select("route");
      if (!supervisor || !supervisor.route) {
        return res.status(400).json({
          message: "Supervisor's route information not found.",
        });
      }
      const route = supervisor.route;

      // Fetch all vendors whose route matches the supervisor's route
      const vendors = await UserModel.find({
        route: route,
        role: "Vendor",
      }).select("-password -otp -otpExpires -__v");

      // Fetch vendors whose route matches the supervisor's route and get their vendorIds
      const vendorIds = vendors.map((vendor) => vendor.vendorId);

      console.log(vendorIds);

      // Fetch all assets reports for all vendors whose route matches the supervisor's route
      const assetsReports = await AssetsReportModel.find({
        uploadedBy: { $in: vendorIds },
      })
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ uploadedOn: -1 }); // Sort by most recent first

      const totalReports = await AssetsReportModel.countDocuments({
        uploadedBy: { $in: vendorIds },
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

  getIssuedAssetsReport = async (req, res) => {
    if (req.user.role !== "Supervisor") {
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

export default SupervisorController;
