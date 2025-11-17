import AssetsReportModel from "../../Schema/assets.report.schema.js";
import MilkReportModel from "../../Schema/milk.report.schema.js";
import SalesReportModel from "../../Schema/sales.report.schema.js";
import UserModel from "../../Schema/user.schema.js";

class VendorController {
  getVendorProfile = async (req, res) => {
    try {
      // Assuming vendorId is available from an authentication middleware (e.g., req.user.vendorId).
      // If not, it might be passed via req.params.id or req.query.vendorId.
      const vendorId = req.user?.vendorId;

      if (!vendorId) {
        return res
          .status(400)
          .json({ success: false, message: "Vendor ID is required." });
      }

      const vendorProfile = await UserModel.findOne(
        { vendorId },
        "name email phoneNumber address vendorId route onboardedBy createdAt updatedAt"
      );

      if (!vendorProfile) {
        return res
          .status(404)
          .json({ success: false, message: "Vendor not found." });
      }

      return res.status(200).json({ data: vendorProfile });

      // --- Placeholder for actual database interaction ---
    } catch (error) {
      console.error("Error fetching vendor profile:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  };

  getVendorMilkReport = async (req, res) => {
    try {
      const vendorId = req.user?.vendorId;
      const { startDate, endDate } = req.query;

      console.log(startDate, endDate);

      if (!vendorId) {
        return res
          .status(400)
          .json({ success: false, message: "Vendor ID is required." });
      }
      console.log(vendorId);
      // Find vendor’s userId (uploadedBy reference)
      const vendor = await UserModel.findOne({ vendorId });
      if (!vendor) {
        return res
          .status(404)
          .json({ success: false, message: "Vendor not found." });
      }

      const query = { vlcUploaderCode: vendorId };

      if (startDate && endDate) {
        query.docDate = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      const milkReportsRaw = await MilkReportModel.find(query).sort({
        docDate: 1,
      });

      // Utility for formatting date to DD-MM-YYYY
      const formatDate = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
      };

      const milkReports = milkReportsRaw.map((report) => ({
        docDate: formatDate(report.docDate),
        shift: report.shift || "",
        vlcUploaderCode: report.vlcUploaderCode || "",
        vlcName: report.vlcName || "",
        milkWeightLtr: report.milkWeightLtr ?? "",
        fatPercentage: report.fatPercentage ?? "",
        snfPercentage: report.snfPercentage ?? "",
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

      return res.status(200).json({ success: true, data: milkReports });
    } catch (error) {
      console.error("Error fetching vendor milk report:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  };

  getVendorSalesReport = async (req, res) => {
    try {
      const vendorId = req.user?.vendorId;
      const { startDate, endDate } = req.query;

      if (!vendorId) {
        return res
          .status(400)
          .json({ success: false, message: "Vendor ID is required." });
      }

      const vendor = await UserModel.findOne({ vendorId });
      if (!vendor) {
        return res
          .status(404)
          .json({ success: false, message: "Vendor not found." });
      }

      const query = { vlcUploaderCode: vendorId };

      if (startDate && endDate) {
        query.docDate = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      const salesReports = await SalesReportModel.find(query).sort({
        docDate: 1,
      });

      return res.status(200).json({ success: true, data: salesReports });
    } catch (error) {
      console.error("Error fetching vendor sales report:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  };

  getVendorIssuedItemsWithHistory = async (req, res) => {
    try {
      const vendorId = req.user?.vendorId;

      if (!vendorId) {
        return res
          .status(400)
          .json({ success: false, message: "Vendor ID is required." });
      }

      const vendor = await UserModel.findOne({ vendorId });
      if (!vendor) {
        return res
          .status(404)
          .json({ success: false, message: "Vendor not found." });
      }

      // Assuming vlcCode = vendorId (adjust if mapping differs)
      const issuedItems = await AssetsReportModel.find({
        vlcCode: vendorId,
      }).lean();

      return res.status(200).json({ success: true, data: issuedItems });
    } catch (error) {
      console.error("Error fetching vendor issued items with history:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  };
}

export default VendorController;
