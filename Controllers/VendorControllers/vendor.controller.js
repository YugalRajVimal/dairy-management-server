import AssetsReportModel from "../../Schema/assets.report.schema.js";
import MilkReportModel from "../../Schema/milk.report.schema.js";
import SalesReportModel from "../../Schema/sales.report.schema.js";
import UserModel from "../../Schema/user.schema.js";

class VendorController {
  getVendorProfile = async (req, res) => {
    try {
      const vendorId = req.user?.vendorId;
  
      if (!vendorId) {
        return res
          .status(400)
          .json({ success: false, message: "Vendor ID is required." });
      }
  
      // Ultra-fast query: minimal fields + lean
      const vendorProfile = await UserModel.findOne(
        { vendorId },
        "name email phoneNo address vendorId route onboardedBy createdAt updatedAt"
      )
        .lean(); // Removes hydration, speeds up response
  
      if (!vendorProfile) {
        return res
          .status(404)
          .json({ success: false, message: "Vendor not found." });
      }
  
      return res.status(200).json({
        success: true,
        data: vendorProfile,
      });
  
    } catch (error) {
      console.error("Error fetching vendor profile:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  };
  

  // getVendorMilkReport = async (req, res) => {
  //   try {
  //     const vendorId = req.user?.vendorId;
  //     const { startDate, endDate } = req.query;

  //     console.log(startDate, endDate);

  //     if (!vendorId) {
  //       return res
  //         .status(400)
  //         .json({ success: false, message: "Vendor ID is required." });
  //     }
  //     console.log(vendorId);
  //     // Find vendor’s userId (uploadedBy reference)
  //     const vendor = await UserModel.findOne({ vendorId });
  //     if (!vendor) {
  //       return res
  //         .status(404)
  //         .json({ success: false, message: "Vendor not found." });
  //     }

  //     const query = { vlcUploaderCode: vendorId };

  //     if (startDate && endDate) {
  //       query.docDate = {
  //         $gte: new Date(startDate),
  //         $lte: new Date(endDate),
  //       };
  //     }

  //     const milkReportsRaw = await MilkReportModel.find(query).sort({
  //       docDate: 1,
  //     });

  //     // Utility for formatting date to DD-MM-YYYY
  //     const formatDate = (date) => {
  //       if (!date) return "";
  //       const d = new Date(date);
  //       const day = String(d.getDate()).padStart(2, "0");
  //       const month = String(d.getMonth() + 1).padStart(2, "0");
  //       const year = d.getFullYear();
  //       return `${day}-${month}-${year}`;
  //     };

  //     const milkReports = milkReportsRaw.map((report) => ({
  //       docDate: formatDate(report.docDate),
  //       shift: report.shift || "",
  //       vlcUploaderCode: report.vlcUploaderCode || "",
  //       vlcName: report.vlcName || "",
  //       milkWeightLtr: report.milkWeightLtr ?? "",
  //       fatPercentage: report.fatPercentage ?? "",
  //       snfPercentage: report.snfPercentage ?? "",
  //       edited: !!report.edited,
  //       history: (report.history || []).map((h) => ({
  //         "DOC DATE": formatDate(h.docDate),
  //         SHIFT: h.shift || "",
  //         "VLC CODE": h.vlcUploaderCode || "",
  //         "VLC NAME": h.vlcName || "",
  //         "MILK WEIGHT (Ltr)": h.milkWeightLtr ?? "",
  //         "FAT %": h.fatPercentage ?? "",
  //         "SNF %": h.snfPercentage ?? "",
  //         "EDITED ON": h.editedOn ? formatDate(h.editedOn) : "",
  //       })),
  //     }));

  //     return res.status(200).json({ success: true, data: milkReports });
  //   } catch (error) {
  //     console.error("Error fetching vendor milk report:", error);
  //     return res
  //       .status(500)
  //       .json({ success: false, message: "Internal server error." });
  //   }
  // };

  getVendorMilkReport = async (req, res) => {
    try {
      const vendorId = req.user?.vendorId;
      const { startDate, endDate, page = 1, limit = 20, search = "" } = req.query;
  
      if (!vendorId) {
        return res.status(400).json({ success: false, message: "Vendor ID is required." });
      }
  
      const vendor = await UserModel.findOne({ vendorId });
      if (!vendor) {
        return res.status(404).json({ success: false, message: "Vendor not found." });
      }
  
      const query = { vlcUploaderCode: vendorId };

      if (startDate && endDate) {
        query.docDate = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      // Add search feature
      if (search && search.trim() !== "") {
        const searchString = search.trim();
        const regex = new RegExp(searchString, "i");
        const orQueries = [
          { shift: regex },
          { vlcUploaderCode: regex },
          { vlcName: regex },
        ];

        // For number fields, try to match if search is number
        const isNumberSearch = !isNaN(searchString) && searchString !== "";
        if (isNumberSearch) {
          const searchNum = Number(searchString);
          orQueries.push(
            { milkWeightLtr: searchNum },
            { fatPercentage: searchNum },
            { snfPercentage: searchNum }
          );
        }

        // For docDate, allow searching as string YYYY-MM-DD or DD-MM-YYYY (by formatting date below and filtering inside .map if needed)
        // But since MongoDB only supports date natively, we'll allow direct date equality
        if (!isNaN(Date.parse(searchString))) {
          orQueries.push({ docDate: new Date(searchString) });
        }

        query.$or = orQueries;
      }

      const skip = (page - 1) * limit;
      const totalCount = await MilkReportModel.countDocuments(query);
  
      // Sort with latest on top
      const milkReportsRaw = await MilkReportModel.find(query)
        .sort({ docDate: -1 }) // Descending order by docDate
        .skip(skip)
        .limit(Number(limit));
  
      const formatDate = (date) => {
        if (!date) return "";
        const d = new Date(date);
        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
      };
  
      let milkReports = milkReportsRaw.map((report) => ({
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

      // If searching by formatted date string (DD-MM-YYYY), filter here
      if (search && search.trim() !== "" && milkReports.length > 0) {
        const searchString = search.trim().toLowerCase();
        // If it's not number/date (which are already handled above), search in stringified fields as fallback
        milkReports = milkReports.filter((report) =>
          report.docDate?.toLowerCase().includes(searchString) ||
          report.shift?.toLowerCase().includes(searchString) ||
          report.vlcUploaderCode?.toLowerCase().includes(searchString) ||
          report.vlcName?.toLowerCase().includes(searchString) ||
          String(report.milkWeightLtr).includes(searchString) ||
          String(report.fatPercentage).includes(searchString) ||
          String(report.snfPercentage).includes(searchString)
        );
      }
  
      return res.status(200).json({
        success: true,
        data: milkReports,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      });
  
    } catch (error) {
      console.error("Error fetching vendor milk report:", error);
      return res.status(500).json({ success: false, message: "Internal server error." });
    }
  };

  

  // getVendorSalesReport = async (req, res) => {
  //   try {
  //     const vendorId = req.user?.vendorId;
  //     const { startDate, endDate } = req.query;

  //     if (!vendorId) {
  //       return res
  //         .status(400)
  //         .json({ success: false, message: "Vendor ID is required." });
  //     }

  //     const vendor = await UserModel.findOne({ vendorId });
  //     if (!vendor) {
  //       return res
  //         .status(404)
  //         .json({ success: false, message: "Vendor not found." });
  //     }

  //     const query = { vlcUploaderCode: vendorId };

  //     if (startDate && endDate) {
  //       query.docDate = {
  //         $gte: new Date(startDate),
  //         $lte: new Date(endDate),
  //       };
  //     }

  //     const salesReports = await SalesReportModel.find(query).sort({
  //       docDate: 1,
  //     });

  //     // Format with custom keys for each report
  //     const formattedReports = salesReports.map((report) => ({
  //       docDate: report.docDate
  //         ? report.docDate.toISOString().split("T")[0]
  //         : "",
  //       vlcUploaderCode: report.vlcUploaderCode || "",
  //       itemCode: report.itemCode || "",
  //       itemName: report.itemName || "",
  //       quantity: report.quantity ?? "",
  //       edited: !!report.edited,
  //       history: (report.history || []).map((h) => ({
  //         "DOC DATE": h.docDate ? h.docDate.toISOString().split("T")[0] : "",
  //         "VLC CODE": h.vlcUploaderCode || "",
  //         "ITEM CODE": h.itemCode || "",
  //         "ITEM NAME": h.itemName || "",
  //         QUANTITY: h.quantity ?? "",
  //         "EDITED ON": h.editedOn ? h.editedOn.toISOString().split("T")[0] : "",
  //       })),
  //     }));

  //     return res.status(200).json({ success: true, data: formattedReports });
  //   } catch (error) {
  //     console.error("Error fetching vendor sales report:", error);
  //     return res
  //       .status(500)
  //       .json({ success: false, message: "Internal server error." });
  //   }
  // };


  getVendorSalesReport = async (req, res) => {
    try {
      const vendorId = req.user?.vendorId;
      const { startDate, endDate, page = 1, limit = 20, search = "" } = req.query;

      if (!vendorId) {
        return res.status(400).json({ success: false, message: "Vendor ID is required." });
      }

      const vendor = await UserModel.findOne({ vendorId });
      if (!vendor) {
        return res.status(404).json({ success: false, message: "Vendor not found." });
      }

      const query = { vlcUploaderCode: vendorId };

      if (startDate && endDate) {
        query.docDate = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      // Add search feature
      if (search && search.trim() !== "") {
        const searchString = search.trim();
        const regex = new RegExp(searchString, "i");
        const orQueries = [
          { vlcUploaderCode: regex },
          { itemCode: regex },
          { itemName: regex },
        ];

        // If search is a number, include quantity as possible match
        const isNumberSearch = !isNaN(searchString) && searchString !== "";
        if (isNumberSearch) {
          const searchNum = Number(searchString);
          orQueries.push({ quantity: searchNum });
        }

        // For docDate, allow searching as YYYY-MM-DD date string
        if (!isNaN(Date.parse(searchString))) {
          orQueries.push({ docDate: new Date(searchString) });
        }

        query.$or = orQueries;
      }

      const skip = (page - 1) * limit;
      const totalCount = await SalesReportModel.countDocuments(query);

      // latest on top
      const salesReports = await SalesReportModel.find(query)
        .sort({ docDate: -1 }) // Descending order: newest first
        .skip(skip)
        .limit(Number(limit));

      const formattedReports = salesReports.map((report) => ({
        docDate: report.docDate ? report.docDate.toISOString().split("T")[0] : "",
        vlcUploaderCode: report.vlcUploaderCode || "",
        itemCode: report.itemCode || "",
        itemName: report.itemName || "",
        quantity: report.quantity ?? "",
        edited: !!report.edited,
        history: (report.history || []).map((h) => ({
          "DOC DATE": h.docDate ? h.docDate.toISOString().split("T")[0] : "",
          "VLC CODE": h.vlcUploaderCode || "",
          "ITEM CODE": h.itemCode || "",
          "ITEM NAME": h.itemName || "",
          QUANTITY: h.quantity ?? "",
          "EDITED ON": h.editedOn ? h.editedOn.toISOString().split("T")[0] : "",
        })),
      }));

      return res.status(200).json({
        success: true,
        data: formattedReports,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      });

    } catch (error) {
      console.error("Error fetching vendor sales report:", error);
      return res.status(500).json({ success: false, message: "Internal server error." });
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

    // Run vendor lookup + issued items lookup in parallel
    const [vendor, issuedItems] = await Promise.all([
      UserModel.findOne({ vendorId }).select("_id").lean(),
      AssetsReportModel.find({ vlcCode: vendorId }).lean()
    ]);

    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found." });
    }

    return res.status(200).json({
      success: true,
      data: issuedItems
    });
  } catch (error) {
    console.error(
      "Error fetching vendor issued items with history:",
      error
    );
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};

}

export default VendorController;
