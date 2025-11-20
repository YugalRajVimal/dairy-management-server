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
        "-password -otp -otpExpires -__v -route"
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
      // Get full supervisor profile, excluding sensitive fields
      const supervisor = await UserModel.findById(req.user.id)
        .select("-password -otp -otpExpires -__v");

      if (!supervisor || !Array.isArray(supervisor.supervisorRoutes) || supervisor.supervisorRoutes.length === 0) {
        return res.status(400).json({
          message: "Supervisor's route information not found.",
        });
      }

      // Count all vendors whose 'route' is in any of supervisor's routes
      const allVendorsCount = await UserModel.countDocuments({
        role: "Vendor",
        route: { $in: supervisor.supervisorRoutes },
      });

      // Find all vendors whose route is in supervisor.supervisorRoutes, get their vendorIds
      const vendorIds = await UserModel.find({
        role: "Vendor",
        route: { $in: supervisor.supervisorRoutes },
      }).distinct("vendorId");

      // Sum up all the milkWeightLtr uploaded by these vendors
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
        supervisorProfile: supervisor,
        supervisorRoutes: supervisor.supervisorRoutes,
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
      const supervisor = await UserModel.findById(req.user.id).select("supervisorRoutes");
      if (!supervisor || !Array.isArray(supervisor.supervisorRoutes) || supervisor.supervisorRoutes.length === 0) {
        return res.status(400).json({
          message: "Supervisor's route information not found.",
        });
      }
      // Find all vendors whose route is in supervisor.supervisorRoutes (array of numbers)
      const vendors = await UserModel.find({
        route: { $in: supervisor.supervisorRoutes },
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

  // getUploadedMilkReport = async (req, res) => {
  //   if (req.user.role !== "Supervisor") {
  //     return res.status(403).json({
  //       message: "Unauthorized: Only Sub Admins can perform this action.",
  //     });
  //   }

  //   try {
  //     const { page = 1, limit = 10 } = req.query;
  //     const skip = (parseInt(page) - 1) * parseInt(limit);

  //     const supervisor = await UserModel.findById(req.user.id).select("route");
  //     if (!supervisor || !supervisor.route) {
  //       return res.status(400).json({
  //         message: "Supervisor's route information not found.",
  //       });
  //     }
  //     const route = supervisor.route;

  //     // Fetch all vendors whose route matches the supervisor's route
  //     const vendors = await UserModel.find({
  //       route: route,
  //       role: "Vendor",
  //     }).select("-password -otp -otpExpires -__v");

  //     // Fetch vendors whose route matches the supervisor's route and get their vendorIds
  //     const vendorIds = vendors.map((vendor) => vendor.vendorId);

  //     // Fetch milk reports where vlcUploaderCode matches any of the vendorIds
  //     const milkReports = await MilkReportModel.find({
  //       vlcUploaderCode: { $in: vendorIds },
  //     })
  //       .skip(skip)
  //       .limit(parseInt(limit))
  //       .sort({ uploadedOn: -1 }); // Sort by most recent upload first

  //     console.log(milkReports);

  //     const totalReports = await MilkReportModel.countDocuments({
  //       vlcUploaderCode: { $in: vendorIds },
  //     });

  //     return res.status(200).json({
  //       message: "Milk reports fetched successfully ✅",
  //       data: milkReports,
  //       currentPage: parseInt(page),
  //       totalPages: Math.ceil(totalReports / parseInt(limit)),
  //       totalReports: totalReports,
  //     });
  //   } catch (error) {
  //     console.error("Error in getUploadedExcelReport:", error);
  //     return res.status(500).json({ error: "Internal server error" });
  //   }
  // };

  // getUploadedSalesReport = async (req, res) => {
  //   if (req.user.role !== "Supervisor") {
  //     return res.status(403).json({
  //       message: "Unauthorized: Only Sub Admins can perform this action.",
  //     });
  //   }

  //   try {
  //     const { page = 1, limit = 10 } = req.query;
  //     const skip = (parseInt(page) - 1) * parseInt(limit);

  //     const supervisor = await UserModel.findById(req.user.id).select("route");
  //     if (!supervisor || !supervisor.route) {
  //       return res.status(400).json({
  //         message: "Supervisor's route information not found.",
  //       });
  //     }
  //     const route = supervisor.route;

  //     // Fetch all vendors whose route matches the supervisor's route
  //     const vendors = await UserModel.find({
  //       route: route,
  //       role: "Vendor",
  //     }).select("-password -otp -otpExpires -__v");

  //     // Fetch vendors whose route matches the supervisor's route and get their vendorIds
  //     const vendorIds = vendors.map((vendor) => vendor.vendorId);

  //     // Fetch all sales reports for all vendorIds on this supervisor's route
  //     const salesReport = await SalesReportModel.find({
  //       vlcUploaderCode: { $in: vendorIds },
  //     })
  //       .skip(skip)
  //       .limit(parseInt(limit))
  //       .sort({ uploadedOn: -1 }); // Sort by most recent upload first

  //     const totalReports = await SalesReportModel.countDocuments({
  //       vlcUploaderCode: { $in: vendorIds },
  //     });

  //     return res.status(200).json({
  //       message: "Sales reports fetched successfully ✅",
  //       data: salesReport,
  //       currentPage: parseInt(page),
  //       totalPages: Math.ceil(totalReports / parseInt(limit)),
  //       totalReports: totalReports,
  //     });
  //   } catch (error) {
  //     console.error("Error in getUploadedSalesReport:", error);
  //     return res.status(500).json({ error: "Internal server error" });
  //   }
  // };

  // getUploadedAssetsReport = async (req, res) => {
  //   if (req.user.role !== "Supervisor") {
  //     return res.status(403).json({
  //       message: "Unauthorized: Only Sub Admins can perform this action.",
  //     });
  //   }

  //   try {
  //     const { page = 1, limit = 10 } = req.query;
  //     const skip = (parseInt(page) - 1) * parseInt(limit);

  //     const userId = req.user.id;

  //     const supervisor = await UserModel.findById(req.user.id).select("route");
  //     if (!supervisor || !supervisor.route) {
  //       return res.status(400).json({
  //         message: "Supervisor's route information not found.",
  //       });
  //     }
  //     const route = supervisor.route;

  //     // Fetch all vendors whose route matches the supervisor's route
  //     const vendors = await UserModel.find({
  //       route: route,
  //       role: "Vendor",
  //     }).select("-password -otp -otpExpires -__v");

  //     // Fetch vendors whose route matches the supervisor's route and get their vendorIds
  //     const vendorIds = vendors.map((vendor) => vendor.vendorId);

  //     console.log(vendorIds);

  //     // Fetch assets reports for all vendors whose route matches the supervisor's route
  //     const assetsReport = await AssetsReportModel.find({
  //       vlcCode: { $in: vendorIds },
  //     })
  //       .skip(skip)
  //       .limit(parseInt(limit))
  //       .sort({ uploadedOn: -1 }); // Sort by most recent upload first

  //     const totalReports = await AssetsReportModel.countDocuments({
  //       vlcCode: { $in: vendorIds },
  //     });

  //     return res.status(200).json({
  //       message: "Assets reports fetched successfully ✅",
  //       data: assetsReport,
  //       currentPage: parseInt(page),
  //       totalPages: Math.ceil(totalReports / parseInt(limit)),
  //       totalReports: totalReports,
  //     });
  //   } catch (error) {
  //     console.error("Error in getUploadedSalesReport:", error);
  //     return res.status(500).json({ error: "Internal server error" });
  //   }
  // };

  // ✅ Get milk, sales, and assets report of a Vendor by VendorId
  getVendorReportsByVendorId = async (req, res) => {
    // Helper function to format date
    const formatDate = (date) => {
      if (!date) return "";
      try {
        return date instanceof Date
          ? date.toISOString().split("T")[0]
          : new Date(date).toISOString().split("T")[0];
      } catch {
        return "";
      }
    };

    try {
      if (req.user.role !== "Supervisor") {
        return res.status(403).json({
          message: "Unauthorized: Only Sub Admins can perform this action.",
        });
      }

      const { vendorId } = req.params; // expects :vendorId in the route

      if (!vendorId) {
        return res
          .status(400)
          .json({ message: "vendorId is required in the route parameter." });
      }

      // Verify vendor exists and is a Vendor
      const vendor = await UserModel.findOne({
        vendorId,
        role: "Vendor",
      }).select("-password -otp -otpExpires -__v");
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      // Fetch Milk Reports for this vendorId
      const milkReportsRaw = await MilkReportModel.find({
        vlcUploaderCode: vendorId,
      }).sort({ uploadedOn: -1 });

      const milkReports = milkReportsRaw.map((report) => ({
        // Use custom headers for milk report

        "DOC DATE": formatDate(report.docDate),
        SHIFT: report.shift || "",
        "VLC CODE": report.vlcUploaderCode || "",
        "VLC NAME": report.vlcName || "",
        "MILK WEIGHT (Ltr)": report.milkWeightLtr ?? "",
        "FAT %": report.fatPercentage ?? "",
        "SNF %": report.snfPercentage ?? "",
        edited: !!report.edited,
        history: (report.history || []).map((h) => ({
          "DOC DATE": formatDate(h.docDate),
          SHIFT: h.shift || "",
          "VLC CODE": h.vlcUploaderCode || "",
          "VLC NAME": h.vlcName || "",
          "MILK WEIGHT (Ltr)": h.milkWeightLtr ?? "",
          "FAT %": h.fatPercentage ?? "",
          "SNF %": h.snfPercentage ?? "",
          "EDITED ON": h.editedOn ? formatDate(h.editedOn) : "",
        })),
      }));

      // Fetch Sales Reports for this vendorId
      const salesReportsRaw = await SalesReportModel.find({
        vlcUploaderCode: vendorId,
      }).sort({ uploadedOn: -1 });

      const salesReports = salesReportsRaw.map((report) => ({
        "DOC DATE": report.docDate ? formatDate(report.docDate) : "",
        "VLC CODE": report.vlcUploaderCode || "",
        "ITEM CODE": report.itemCode || "",
        "ITEM NAME": report.itemName || "",
        QUANTITY: report.quantity ?? "",
        edited: !!report.edited,
        history: (report.history || []).map((h) => ({
          "DOC DATE": h.docDate ? formatDate(h.docDate) : "",
          "VLC CODE": h.vlcUploaderCode || "",
          "ITEM CODE": h.itemCode || "",
          "ITEM NAME": h.itemName || "",
          QUANTITY: h.quantity ?? "",
          "EDITED ON": h.editedOn ? formatDate(h.editedOn) : "",
        })),
      }));

      // Fetch Assets Reports for this vendorId (minimal formatting for consistency)
      const assetsReportsRaw = await AssetsReportModel.find({
        vlcCode: vendorId,
      }).sort({ uploadedOn: -1 });

      const assetsReports = assetsReportsRaw.map((report) => ({
        "UPLOADED ON": formatDate(report.uploadedOn),
        "UPLOADED BY": report.uploadedBy || "",
        "VLC CODE": report.vlcCode || "",
        "SR NO": report.srNo || "",
        "STOCK NO": report.stockNo || "",
        RT: report.rt != null ? report.rt : "",
        DUPLICATE: report.duplicate != null ? report.duplicate : "",
        "VLC NAME": report.vlcName || "",
        STATUS: report.status || "",
        "C STATUS": report.cStatus || "",
        CAN: report.can != null ? report.can : "",
        LID: report.lid != null ? report.lid : "",
        PVC: report.pvc != null ? report.pvc : "",
        DPS: report.dps || "",
        KEYBOARD: report.keyboard != null ? report.keyboard : "",
        PRINTER: report.printer != null ? report.printer : "",
        CHARGER: report.charger != null ? report.charger : "",
        STRIPPER: report.stripper != null ? report.stripper : "",
        SOLAR: report.solar != null ? report.solar : "",
        CONTROLLER: report.controller != null ? report.controller : "",
        EWS: report.ews != null ? report.ews : "",
        DISPLAY: report.display != null ? report.display : "",
        BATTERY: report.battery != null ? report.battery : "",
        BOND: report.bond || "",
        "VSP SIGN": report.vspSign != null ? report.vspSign : "",
        history: (report.history || []).map((h) => ({
          "SR NO": h.srNo || "-",
          "STOCK NO": h.stockNo || "-",
          RT: h.rt ?? "-",
          STATUS: h.status ?? "-",
          "C STATUS": h.cStatus ?? "-",
          CAN: h.can ?? "-",
          LID: h.lid ?? "-",
          PVC: h.pvc ?? "-",
          DPS: h.dps ?? "-",
          KEYBOARD: h.keyboard ?? "-",
          PRINTER: h.printer ?? "-",
          CHARGER: h.charger ?? "-",
          STRIPPER: h.stripper ?? "-",
          SOLAR: h.solar ?? "-",
          CONTROLLER: h.controller ?? "-",
          EWS: h.ews ?? "-",
          DISPLAY: h.display ?? "-",
          BATTERY: h.battery ?? "-",
          BOND: h.bond ?? "-",
          "VSP SIGN": h.vspSign ?? "-",
          "CHANGED ON": h.changedOn ? formatDate(h.changedOn) : "",
        })),
      }));

      return res.status(200).json({
        message: "Vendor reports fetched successfully ✅",
        vendor: {
          id: vendor._id,
          vendorId,
          name: vendor.name,
          email: vendor.email,
          phoneNo: vendor.phoneNo,
          route: vendor.route,
        },
        milkReports,
        salesReports,
        assetsReports,
      });
    } catch (error) {
      console.error("Error in getVendorReportsByVendorId:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };

  // getAssetsReport = async (req, res) => {
  //   try {
  //     const { page = 1, limit = 10 } = req.query;
  //     const skip = (parseInt(page) - 1) * parseInt(limit);

  //     const userId = req.user.id;

  //     const supervisor = await UserModel.findById(req.user.id).select("route");
  //     if (!supervisor || !supervisor.route) {
  //       return res.status(400).json({
  //         message: "Supervisor's route information not found.",
  //       });
  //     }
  //     const route = supervisor.route;

  //     // Fetch all vendors whose route matches the supervisor's route
  //     const vendors = await UserModel.find({
  //       route: route,
  //       role: "Vendor",
  //     }).select("-password -otp -otpExpires -__v");

  //     // Fetch vendors whose route matches the supervisor's route and get their vendorIds
  //     const vendorIds = vendors.map((vendor) => vendor.vendorId);

  //     console.log(vendorIds);

  //     // Fetch all assets reports for all vendors whose route matches the supervisor's route
  //     const assetsReports = await AssetsReportModel.find({
  //       uploadedBy: { $in: vendorIds },
  //     })
  //       .skip(skip)
  //       .limit(parseInt(limit))
  //       .sort({ uploadedOn: -1 }); // Sort by most recent first

  //     const totalReports = await AssetsReportModel.countDocuments({
  //       uploadedBy: { $in: vendorIds },
  //     });

  //     return res.status(200).json({
  //       message: "Assets reports fetched successfully ✅",
  //       data: assetsReports,
  //       currentPage: parseInt(page),
  //       totalPages: Math.ceil(totalReports / parseInt(limit)),
  //       totalReports: totalReports,
  //     });
  //   } catch (error) {
  //     console.error("Error in getAssetsReport:", error);
  //     return res.status(500).json({ error: "Internal server error" });
  //   }
  // };

  // getIssuedAssetsReport = async (req, res) => {
  //   if (req.user.role !== "Supervisor") {
  //     return res.status(403).json({
  //       message: "Unauthorized: Only Sub Admins can perform this action.",
  //     });
  //   }

  //   try {
  //     const subAdminId = req.user.id; // use the authenticated user's ID

  //     const assetsReport = await IssuedAssetsToSubAdminModel.findOne({
  //       subAdminId,
  //     }).lean();

  //     const usedAssetsReport = await UsedAssetsOfSubAdminModel.findOne({
  //       subAdminId,
  //     }).lean();

  //     if (!assetsReport) {
  //       return res.status(404).json({
  //         message: "No issued assets report found for this sub-admin.",
  //       });
  //     }

  //     res.status(200).json({
  //       message: "Issued assets report fetched successfully.",
  //       data: assetsReport,
  //       usedAssets: usedAssetsReport,
  //     });
  //   } catch (error) {
  //     console.error("Error fetching issued assets report:", error);
  //     res.status(500).json({ message: "Internal Server Error" });
  //   }
  // };
}

export default SupervisorController;
