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
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }
  
      const supervisor = await UserModel.findById(req.user.id)
        .select("-password -otp -otpExpires -__v -route")
        .lean();
  
      if (!supervisor) {
        return res.status(404).json({ message: "Supervisor not found" });
      }
  
      return res.status(200).json({
        message: "Supervisor profile fetched successfully.",
        profile: supervisor,
      });
    } catch (error) {
      console.error("Error fetching supervisor profile:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
  

  getDashboardDetails = async (req, res) => {
    if (req.user.role !== "Supervisor") {
      return res.status(403).json({
        message: "Unauthorized: Only Supervisor can perform this action.",
      });
    }

    try {
      // 1. Fetch supervisor profile first
      const supervisor = await UserModel.findById(req.user.id)
        .select("-password -otp -otpExpires -__v")
        .lean();

      const supervisorRoutes = supervisor?.supervisorRoutes;

      if (!supervisorRoutes || supervisorRoutes.length === 0) {
        return res.status(400).json({
          message: "Supervisor's route information not found.",
        });
      }

      if (!supervisor || !supervisor.onboardedBy) {
        return res.status(400).json({
          message: "Supervisor's onboardedBy information not found.",
        });
      }

      // Find vendors who:
      // 1. Are onboarded by the same subadmin who onboarded this supervisor
      // 2. Have at least one route included in supervisorRoutes
      const vendors = await UserModel.find({
        role: "Vendor",
        onboardedBy: supervisor.onboardedBy,
        route: { $in: supervisorRoutes }
      }).select("vendorId route").lean();

      const vendorIds = vendors.map(v => v.vendorId).filter(Boolean);

      // Count only those vendors that satisfied both above conditions
      const allVendorsCount = vendors.length;

      // Aggregate total milk for these vendors only
      let milkWeightSum = 0;
      if (vendorIds.length > 0) {
        const milkAggregation = await MilkReportModel.aggregate([
          { $match: { vlcUploaderCode: { $in: vendorIds } } },
          { $group: { _id: null, total: { $sum: "$milkWeightLtr" } } },
        ]);
        milkWeightSum = milkAggregation.length ? milkAggregation[0].total : 0;
      }

      return res.status(200).json({
        message: "Dashboard details fetched successfully.",
        allVendorsCount,
        milkWeightSum,
        supervisorProfile: supervisor,
        supervisorRoutes: supervisorRoutes,
      });
    } catch (error) {
      console.error("Error fetching dashboard details:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

  


  getMilkReports = async (req, res) => {
    if (req.user.role !== "Supervisor") {
      return res.status(403).json({
        message: "Unauthorized: Only Supervisor can perform this action.",
      });
    }

    try {
      const { startDate, endDate } = req.query;

      // Fetch supervisor and get their onboardedBy
      const supervisor = await UserModel.findById(req.user.id).select("onboardedBy");
      if (!supervisor || !supervisor.onboardedBy) {
        return res.status(400).json({
          message: "Supervisor's onboardedBy information not found.",
        });
      }

      // Find all vendors that have the same onboardedBy as the supervisor's onboardedBy
      const vendorIds = await UserModel.find({
        role: "Vendor",
        onboardedBy: supervisor.onboardedBy,
      }).distinct("vendorId");

      if (!vendorIds || vendorIds.length === 0) {
        return res.status(200).json({
          message: "No vendors found for this supervisor.",
          milkWeightSum: 0,
          total: 0,
          data: [],
        });
      }

      // Main aggregation
      const matchStage = {
        vlcUploaderCode: { $in: vendorIds },
      };

      // Add date filtering
      if (startDate || endDate) {
        matchStage.docDate = {};
        if (startDate) matchStage.docDate.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          matchStage.docDate.$lte = end;
        }
      }

      const result = await MilkReportModel.aggregate([
        { $match: matchStage },

        {
          $facet: {
            metadata: [
              { $count: "total" },
              { $project: { total: 1 } },
            ],

            weightSum: [
              { $group: { _id: null, total: { $sum: "$milkWeightLtr" } } },
            ],

            allData: [
              { $sort: { docDate: -1 } },
              {
                $project: {
                  vlcUploaderCode: 1,
                  docDate: 1,
                  milkWeightLtr: 1,
                  shift: 1,
                },
              },
            ],
          },
        },
      ]);

      const totalReports = result[0]?.metadata?.[0]?.total || 0;
      const milkWeightSum = result[0]?.weightSum?.[0]?.total || 0;

      return res.status(200).json({
        message: "Milk reports fetched successfully.",
        milkWeightSum,
        total: totalReports,
        data: result[0]?.allData || [],
      });

    } catch (error) {
      console.error("Error fetching milk reports:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
  
  // getAllVendors = async (req, res) => {
  //   if (req.user.role !== "Supervisor") {
  //     return res.status(403).json({
  //       message: "Unauthorized: Only Supervisors can perform this action.",
  //     });
  //   }

  //   try {
  //     let { page = 1, limit, search = "" } = req.query;
  //     page = Number(page);

  //     // If limit is not set or falsy, show all data (do not paginate)
  //     let usePagination = true;
  //     if (!limit || isNaN(Number(limit))) {
  //       usePagination = false;
  //       limit = undefined;
  //     } else {
  //       limit = Number(limit);
  //       if (limit <= 0) usePagination = false;
  //     }
  //     const skip = usePagination ? (page - 1) * limit : 0;

  //     // Fetch supervisor for supervisorRoutes and onboardedBy
  //     const supervisor = await UserModel.findById(req.user.id).select("supervisorRoutes onboardedBy");

  //     if (
  //       !supervisor ||
  //       !Array.isArray(supervisor.supervisorRoutes) ||
  //       supervisor.supervisorRoutes.length === 0
  //     ) {
  //       return res.status(400).json({
  //         message: "Supervisor's route information not found.",
  //       });
  //     }

  //     // Make sure supervisor has onboardedBy
  //     if (!supervisor.onboardedBy) {
  //       return res.status(400).json({
  //         message: "Supervisor's onboardedBy information not found.",
  //       });
  //     }

  //     // Build search filter if needed
  //     let searchFilter = {};
  //     if (search && typeof search === "string" && search.trim() !== "") {
  //       const regex = new RegExp(search.trim(), "i");
  //       searchFilter = {
  //         $or: [
  //           { name: regex },
  //           { email: regex },
  //           { phoneNo: regex },
  //           { vendorId: regex },
  //           { "address.addressLine": regex },
  //           { "address.city": regex },
  //           { "address.state": regex },
  //           { "address.pincode": regex },
  //           // More fields as needed
  //         ]
  //       };
  //     }

  //     // Aggregation filter must also check vendors with same onboardedBy as supervisor
  //     const matchFilter = {
  //       role: "Vendor",
  //       route: { $in: supervisor.supervisorRoutes },
  //       onboardedBy: supervisor.onboardedBy,
  //       ...searchFilter,
  //     };

  //     let pipeline = [
  //       {
  //         $match: matchFilter,
  //       }
  //     ];

  //     if (usePagination) {
  //       pipeline.push({
  //         $facet: {
  //           metadata: [
  //             { $count: "total" }
  //           ],
  //           data: [
  //             { $sort: { createdAt: -1 } },
  //             { $skip: skip },
  //             { $limit: limit },
  //             {
  //               $project: {
  //                 password: 0,
  //                 otp: 0,
  //                 otpExpires: 0,
  //                 __v: 0
  //               }
  //             }
  //           ]
  //         }
  //       });

  //       const result = await UserModel.aggregate(pipeline);
  //       const total = result?.[0]?.metadata?.[0]?.total || 0;
  //       return res.status(200).json({
  //         message: "Vendors fetched successfully.",
  //         vendors: result?.[0]?.data || [],
  //         pagination: {
  //           page: page,
  //           limit: limit,
  //           total,
  //           totalPages: Math.ceil(total / (limit || 1)),
  //         },
  //       });
  //     } else {
  //       // No pagination, get all
  //       pipeline.push(
  //         { $sort: { createdAt: -1 } },
  //         {
  //           $project: {
  //             password: 0,
  //             otp: 0,
  //             otpExpires: 0,
  //             __v: 0
  //           }
  //         }
  //       );
  //       const result = await UserModel.aggregate(pipeline);
  //       return res.status(200).json({
  //         message: "Vendors fetched successfully.",
  //         vendors: result,
  //         pagination: {
  //           page: 1,
  //           limit: result.length,
  //           total: result.length,
  //           totalPages: 1,
  //         },
  //       });
  //     }

  //   } catch (error) {
  //     console.error("Error fetching Vendors:", error);
  //     return res.status(500).json({ message: "Internal Server Error" });
  //   }
  // };

  getAllVendors = async (req, res) => {
    if (req.user.role !== "Supervisor") {
      return res.status(403).json({
        message: "Unauthorized: Only Supervisors can perform this action.",
      });
    }
  
    try {
      let { page = 1, limit, search = "" } = req.query;
      page = Number(page);

      // If limit is not set or falsy, show all data (do not paginate)
      let usePagination = true;
      if (!limit || isNaN(Number(limit))) {
        usePagination = false;
        limit = undefined;
      } else {
        limit = Number(limit);
        if (limit <= 0) usePagination = false;
      }
      const skip = usePagination ? (page - 1) * limit : 0;

      // Fetch supervisor for supervisorRoutes and onboardedBy
      const supervisor = await UserModel.findById(req.user.id).select("supervisorRoutes onboardedBy");

      if (
        !supervisor ||
        !Array.isArray(supervisor.supervisorRoutes) ||
        supervisor.supervisorRoutes.length === 0
      ) {
        return res.status(400).json({
          message: "Supervisor's route information not found.",
        });
      }

      // Make sure supervisor has onboardedBy
      if (!supervisor.onboardedBy) {
        return res.status(400).json({
          message: "Supervisor's onboardedBy information not found.",
        });
      }

      // Build search filter if needed
      let searchFilter = {};
      if (search && typeof search === "string" && search.trim() !== "") {
        const regex = new RegExp(search.trim(), "i");
        searchFilter = {
          $or: [
            { name: regex },
            { email: regex },
            { phoneNo: regex },
            { vendorId: regex },
            { "address.addressLine": regex },
            { "address.city": regex },
            { "address.state": regex },
            { "address.pincode": regex },
            // More fields as needed
          ]
        };
      }

      // Aggregation filter must also check vendors with same onboardedBy as supervisor
      const matchFilter = {
        role: "Vendor",
        route: { $in: supervisor.supervisorRoutes },
        onboardedBy: supervisor.onboardedBy,
        ...searchFilter,
      };

      let pipeline = [
        {
          $match: matchFilter,
        }
      ];

      // If pagination, facet the pipeline, else just aggregate all
      if (usePagination) {
        pipeline.push({
          $facet: {
            metadata: [
              { $count: "total" }
            ],
            data: [
              { $sort: { createdAt: -1 } },
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  password: 0,
                  otp: 0,
                  otpExpires: 0,
                  __v: 0
                }
              }
            ]
          }
        });

        const result = await UserModel.aggregate(pipeline);
        const total = result?.[0]?.metadata?.[0]?.total || 0;
        const vendors = result?.[0]?.data || [];

        // For each vendor, aggregate totalMilkQuantity, avgSNF, avgFAT (bulk from MilkReportModel)
        if (vendors.length > 0) {
          const vendorIds = vendors.map(v => v.vendorId).filter(Boolean);

          // Query aggregation in MilkReportModel for all these vendorIds at once
          const vendorAggregate = await MilkReportModel.aggregate([
            { $match: { vlcUploaderCode: { $in: vendorIds } } },
            {
              $group: {
                _id: "$vlcUploaderCode",
                totalMilkQuantity: { $sum: "$milkWeightLtr" },
                avgSNF: { $avg: "$snfPercentage" },
                avgFAT: { $avg: "$fatPercentage" }
              }
            }
          ]);

          // Convert aggregation to quick-access map
          const vendorStatsMap = {};

          vendorAggregate.forEach(va => {
            vendorStatsMap[va._id] = {
              totalMilkQuantity: va.totalMilkQuantity || 0,
              avgSNF: va.avgSNF || 0,
              avgFAT: va.avgFAT || 0
            };
          });

          // Merge stats into each vendor record
          vendors.forEach(v => {
            const stats = vendorStatsMap[v.vendorId] || {};
            v.totalMilkQuantity = stats.totalMilkQuantity || 0;
            v.avgSNF = stats.avgSNF || 0;
            v.avgFAT = stats.avgFAT || 0;
          });
        }

        return res.status(200).json({
          message: "Vendors fetched successfully.",
          vendors,
          pagination: {
            page: page,
            limit: limit,
            total,
            totalPages: Math.ceil(total / (limit || 1)),
          },
        });
      } else {
        // No pagination, get all
        pipeline.push(
          { $sort: { createdAt: -1 } },
          {
            $project: {
              password: 0,
              otp: 0,
              otpExpires: 0,
              __v: 0
            }
          }
        );
        const vendors = await UserModel.aggregate(pipeline);

        // For each vendor, aggregate totalMilkQuantity, avgSNF, avgFAT (bulk from MilkReportModel)
        if (vendors.length > 0) {
          const vendorIds = vendors.map(v => v.vendorId).filter(Boolean);

          // Query aggregation in MilkReportModel for all these vendorIds at once
          const vendorAggregate = await MilkReportModel.aggregate([
            { $match: { vlcUploaderCode: { $in: vendorIds } } },
            {
              $group: {
                _id: "$vlcUploaderCode",
                totalMilkQuantity: { $sum: "$milkWeightLtr" },
                avgSNF: { $avg: "$snfPercentage" },
                avgFAT: { $avg: "$fatPercentage" }
              }
            }
          ]);
          // Convert aggregation to quick-access map
          const vendorStatsMap = {};
          vendorAggregate.forEach(va => {
            vendorStatsMap[va._id] = {
              totalMilkQuantity: va.totalMilkQuantity || 0,
              avgSNF: va.avgSNF || 0,
              avgFAT: va.avgFAT || 0
            };
          });

          // Merge stats into each vendor record
          vendors.forEach(v => {
            const stats = vendorStatsMap[v.vendorId] || {};
            v.totalMilkQuantity = stats.totalMilkQuantity || 0;
            v.avgSNF = stats.avgSNF || 0;
            v.avgFAT = stats.avgFAT || 0;
          });
        }

        return res.status(200).json({
          message: "Vendors fetched successfully.",
          vendors,
          pagination: {
            page: 1,
            limit: vendors.length,
            total: vendors.length,
            totalPages: 1,
          },
        });
      }
    } catch (error) {
      console.error("Error fetching Vendors:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
  
  getVendorReportsByVendorId = async (req, res) => {
    const formatDate = (d) => {
      if (!d) return "";
      try {
        return new Date(d).toISOString().split("T")[0];
      } catch {
        return "";
      }
    };

    try {
      if (req.user.role !== "Supervisor") {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const { vendorId } = req.params;
      const { startDate, endDate } = req.query;

      if (!vendorId) {
        return res.status(400).json({ message: "vendorId is required" });
      }

      // Fetch vendor
      const vendor = await UserModel.findOne({
        vendorId,
        role: "Vendor",
      })
        .select("name email phoneNo route vendorId")
        .lean();

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      let useDateFilter = false;
      let sDate, eDate;
      let rangeStart, rangeEnd;

      if (startDate || endDate) {
        useDateFilter = true;
        if (startDate) {
          sDate = new Date(startDate);
          sDate.setHours(0, 0, 0, 0);
        }
        if (endDate) {
          eDate = new Date(endDate);
          eDate.setHours(23, 59, 59, 999);
        }
        if (sDate && !eDate) {
          eDate = new Date(sDate);
          eDate.setHours(23, 59, 59, 999);
        }
        if (!sDate && eDate) {
          sDate = new Date(eDate);
          sDate.setHours(0, 0, 0, 0);
        }
        if (sDate && eDate && sDate > eDate) {
          const temp = sDate;
          sDate = eDate;
          eDate = temp;
        }
        rangeStart = sDate;
        rangeEnd = eDate;
      } else {
        // No filter: get all min/max dates for this vendor
        const minmax = await MilkReportModel.aggregate([
          { $match: { vlcUploaderCode: vendorId } },
          {
            $group: {
              _id: null,
              minDate: { $min: "$docDate" },
              maxDate: { $max: "$docDate" },
            },
          },
        ]);
        if (minmax.length > 0) {
          rangeStart = minmax[0].minDate;
          rangeEnd = minmax[0].maxDate;
        } else {
          rangeStart = null;
          rangeEnd = null;
        }
      }

      let milkQuery = { vlcUploaderCode: vendorId };
      let salesQuery = { vlcUploaderCode: vendorId };
      let queryDateFilter = {};

      if (useDateFilter && sDate && eDate) {
        queryDateFilter = {
          docDate: {
            $gte: sDate,
            $lte: eDate,
          },
        };
        milkQuery = { ...milkQuery, ...queryDateFilter };
        salesQuery = { ...salesQuery, ...queryDateFilter };
      }

      // Milk stats (either filtered or all data)
      let vendorStats;
      if (useDateFilter && sDate && eDate) {
        vendorStats = await MilkReportModel.aggregate([
          { $match: milkQuery },
          {
            $group: {
              _id: "$vlcUploaderCode",
              totalMilkQuantity: { $sum: "$milkWeightLtr" },
              avgSNF: { $avg: "$snfPercentage" },
              avgFAT: { $avg: "$fatPercentage" },
            },
          },
        ]);
      } else {
        vendorStats = await MilkReportModel.aggregate([
          { $match: { vlcUploaderCode: vendorId } },
          {
            $group: {
              _id: "$vlcUploaderCode",
              totalMilkQuantity: { $sum: "$milkWeightLtr" },
              avgSNF: { $avg: "$snfPercentage" },
              avgFAT: { $avg: "$fatPercentage" },
            },
          },
        ]);
      }

      let totalMilkQuantity = 0, avgSNF = 0, avgFAT = 0;
      if (vendorStats.length > 0) {
        totalMilkQuantity = vendorStats[0].totalMilkQuantity || 0;
        avgSNF = vendorStats[0].avgSNF || 0;
        avgFAT = vendorStats[0].avgFAT || 0;
      }

      // Find sales/assets (milk/sales: filtered if dates given, else all, assets: always all)
      let milkRaw, salesRaw, assetsRaw;
      if (useDateFilter && sDate && eDate) {
        [milkRaw, salesRaw, assetsRaw] = await Promise.all([
          MilkReportModel.find(milkQuery)
            .select(
              "docDate shift vlcUploaderCode vlcName milkWeightLtr fatPercentage snfPercentage edited history uploadedOn"
            )
            .sort({ docDate: -1 })
            .lean(),

          SalesReportModel.find(salesQuery)
            .select(
              "docDate vlcUploaderCode itemCode itemName quantity edited history uploadedOn"
            )
            .sort({ docDate: -1 })
            .lean(),

          AssetsReportModel.find({
            vlcCode: vendorId,
          })
            .select(
              "uploadedOn uploadedBy vlcCode srNo stockNo rt duplicate vlcName status cStatus can lid pvc dps keyboard printer charger stripper solar controller ews display battery bond vspSign history"
            )
            .sort({ uploadedOn: -1 })
            .lean(),
        ]);
      } else {
        [milkRaw, salesRaw, assetsRaw] = await Promise.all([
          MilkReportModel.find({ vlcUploaderCode: vendorId })
            .select(
              "docDate shift vlcUploaderCode vlcName milkWeightLtr fatPercentage snfPercentage edited history uploadedOn"
            )
            .sort({ docDate: -1 })
            .lean(),

          SalesReportModel.find({ vlcUploaderCode: vendorId })
            .select(
              "docDate vlcUploaderCode itemCode itemName quantity edited history uploadedOn"
            )
            .sort({ docDate: -1 })
            .lean(),

          AssetsReportModel.find({
            vlcCode: vendorId,
          })
            .select(
              "uploadedOn uploadedBy vlcCode srNo stockNo rt duplicate vlcName status cStatus can lid pvc dps keyboard printer charger stripper solar controller ews display battery bond vspSign history"
            )
            .sort({ uploadedOn: -1 })
            .lean(),
        ]);
      }

      // Build per-date, per-shift milk quantity
      let eachDayStats = [];
      let dateRangeOutput = {};

      if (rangeStart && rangeEnd) {
        // Always try to prepare per-date stats and dateRange (full or filtered)
        const perDateMilk = {};
        let datePtr = new Date(rangeStart);
        datePtr.setHours(0, 0, 0, 0);
        let limitDate = new Date(rangeEnd);
        limitDate.setHours(23, 59, 59, 999);
        while (datePtr <= limitDate) {
          const f = formatDate(datePtr);
          perDateMilk[f] = { date: f, MORNING: 0, EVENING: 0 };
          datePtr.setDate(datePtr.getDate() + 1);
        }
        for (const r of milkRaw) {
          const fDate = formatDate(r.docDate);
          if (!perDateMilk[fDate]) continue;
          const shift = r.shift ? r.shift.toUpperCase() : "";
          if (shift === "MORNING") {
            perDateMilk[fDate].MORNING += r.milkWeightLtr || 0;
          } else if (shift === "EVENING") {
            perDateMilk[fDate].EVENING += r.milkWeightLtr || 0;
          }
        }
        eachDayStats = Object.values(perDateMilk);
        dateRangeOutput = {
          startingDate: formatDate(rangeStart),
          endingDate: formatDate(rangeEnd),
        };
      } else {
        eachDayStats = [];
        dateRangeOutput = {};
      }

      // Format main milk, sales, assets data
      const milkReports = milkRaw.map((r) => ({
        "DOC DATE": formatDate(r.docDate),
        SHIFT: r.shift || "",
        "VLC CODE": r.vlcUploaderCode || "",
        "VLC NAME": r.vlcName || "",
        "MILK WEIGHT (Ltr)": r.milkWeightLtr ?? "",
        "FAT %": r.fatPercentage ?? "",
        "SNF %": r.snfPercentage ?? "",
        edited: !!r.edited,
        history: r.history?.map((h) => ({
          "DOC DATE": formatDate(h.docDate),
          SHIFT: h.shift || "",
          "VLC CODE": h.vlcUploaderCode || "",
          "VLC NAME": h.vlcName || "",
          "MILK WEIGHT (Ltr)": h.milkWeightLtr ?? "",
          "FAT %": h.fatPercentage ?? "",
          "SNF %": h.snfPercentage ?? "",
          "EDITED ON": formatDate(h.editedOn),
        })),
      }));

      const salesReports = salesRaw.map((r) => ({
        "DOC DATE": formatDate(r.docDate),
        "VLC CODE": r.vlcUploaderCode || "",
        "ITEM CODE": r.itemCode || "",
        "ITEM NAME": r.itemName || "",
        QUANTITY: r.quantity ?? "",
        edited: !!r.edited,
        history: r.history?.map((h) => ({
          "DOC DATE": formatDate(h.docDate),
          "VLC CODE": h.vlcUploaderCode || "",
          "ITEM CODE": h.itemCode || "",
          "ITEM NAME": h.itemName || "",
          QUANTITY: h.quantity ?? "",
          "EDITED ON": formatDate(h.editedOn),
        })),
      }));

      const assetsReports = assetsRaw.map((r) => ({
        "UPLOADED ON": formatDate(r.uploadedOn),
        "UPLOADED BY": r.uploadedBy || "",
        "VLC CODE": r.vlcCode || "",
        "SR NO": r.srNo || "",
        "STOCK NO": r.stockNo || "",
        RT: r.rt ?? "",
        DUPLICATE: r.duplicate ?? "",
        "VLC NAME": r.vlcName || "",
        STATUS: r.status || "",
        "C STATUS": r.cStatus || "",
        CAN: r.can ?? "",
        LID: r.lid ?? "",
        PVC: r.pvc ?? "",
        DPS: r.dps || "",
        KEYBOARD: r.keyboard ?? "",
        PRINTER: r.printer ?? "",
        CHARGER: r.charger ?? "",
        STRIPPER: r.stripper ?? "",
        SOLAR: r.solar ?? "",
        CONTROLLER: r.controller ?? "",
        EWS: r.ews ?? "",
        DISPLAY: r.display ?? "",
        BATTERY: r.battery ?? "",
        BOND: r.bond || "",
        "VSP SIGN": r.vspSign ?? "",
        history: r.history?.map((h) => ({
          "SR NO": h.srNo || "-",
          "STOCK NO": h.stockNo || "-",
          RT: h.rt ?? "-",
          STATUS: h.status ?? "-",
          "C STATUS": h.cStatus ?? "-",
          "CAN": h.can ?? "-",
          "LID": h.lid ?? "-",
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
          "CHANGED ON": formatDate(h.changedOn),
        })),
      }));

      return res.status(200).json({
        message: "Vendor reports fetched successfully",
        vendor,
        milkReports,
        salesReports,
        assetsReports,
        totalMilkQuantity,
        avgSNF,
        avgFAT,
        dateRange: dateRangeOutput,
        eachDayMilkStats: eachDayStats // [{ date, MORNING, EVENING }]
      });
    } catch (error) {
      console.error("Error in getVendorReportsByVendorId:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
  
  // getVendorReportsByVendorId = async (req, res) => {
  //   // Helper function to format date
  //   const formatDate = (date) => {
  //     if (!date) return "";
  //     try {
  //       return date instanceof Date
  //         ? date.toISOString().split("T")[0]
  //         : new Date(date).toISOString().split("T")[0];
  //     } catch {
  //       return "";
  //     }
  //   };

  //   try {
  //     if (req.user.role !== "Supervisor") {
  //       return res.status(403).json({
  //         message: "Unauthorized: Only Sub Admins can perform this action.",
  //       });
  //     }

  //     const { vendorId } = req.params; // expects :vendorId in the route
  //     const { startDate, endDate } = req.query; // Date filters for DOC DATE
      
  //     if (!vendorId) {
  //       return res
  //         .status(400)
  //         .json({ message: "vendorId is required in the route parameter." });
  //     }

  //     // Verify vendor exists and is a Vendor
  //     const vendor = await UserModel.findOne({
  //       vendorId,
  //       role: "Vendor",
  //     }).select("-password -otp -otpExpires -__v");
  //     if (!vendor) {
  //       return res.status(404).json({ message: "Vendor not found" });
  //     }

  //     // Prepare date filter for Milk and Sales Reports
  //     let milkDocDateFilter = {};
  //     let salesDocDateFilter = {};

  //     if (startDate || endDate) {
  //       milkDocDateFilter.docDate = {};
  //       salesDocDateFilter.docDate = {};

  //       if (startDate) {
  //         milkDocDateFilter.docDate.$gte = new Date(startDate);
  //         salesDocDateFilter.docDate.$gte = new Date(startDate);
  //       }
  //       if (endDate) {
  //         // End date should include the entire end day, so set time to 23:59:59.999
  //         const end = new Date(endDate);
  //         end.setHours(23, 59, 59, 999);
  //         milkDocDateFilter.docDate.$lte = end;
  //         salesDocDateFilter.docDate.$lte = end;
  //       }

  //       // Remove if filter object is empty
  //       if (Object.keys(milkDocDateFilter.docDate).length === 0) delete milkDocDateFilter.docDate;
  //       if (Object.keys(salesDocDateFilter.docDate).length === 0) delete salesDocDateFilter.docDate;
  //     }

  //     // Fetch Milk Reports for this vendorId, filter by DOC DATE if provided
  //     const milkReportsRaw = await MilkReportModel.find({
  //       vlcUploaderCode: vendorId,
  //       ...milkDocDateFilter,
  //     }).sort({ uploadedOn: -1 });

  //     const milkReports = milkReportsRaw.map((report) => ({
  //       // Use custom headers for milk report
  //       "DOC DATE": formatDate(report.docDate),
  //       SHIFT: report.shift || "",
  //       "VLC CODE": report.vlcUploaderCode || "",
  //       "VLC NAME": report.vlcName || "",
  //       "MILK WEIGHT (Ltr)": report.milkWeightLtr ?? "",
  //       "FAT %": report.fatPercentage ?? "",
  //       "SNF %": report.snfPercentage ?? "",
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

  //     // Fetch Sales Reports for this vendorId, filter by DOC DATE if provided
  //     const salesReportsRaw = await SalesReportModel.find({
  //       vlcUploaderCode: vendorId,
  //       ...salesDocDateFilter,
  //     }).sort({ uploadedOn: -1 });

  //     const salesReports = salesReportsRaw.map((report) => ({
  //       "DOC DATE": report.docDate ? formatDate(report.docDate) : "",
  //       "VLC CODE": report.vlcUploaderCode || "",
  //       "ITEM CODE": report.itemCode || "",
  //       "ITEM NAME": report.itemName || "",
  //       QUANTITY: report.quantity ?? "",
  //       edited: !!report.edited,
  //       history: (report.history || []).map((h) => ({
  //         "DOC DATE": h.docDate ? formatDate(h.docDate) : "",
  //         "VLC CODE": h.vlcUploaderCode || "",
  //         "ITEM CODE": h.itemCode || "",
  //         "ITEM NAME": h.itemName || "",
  //         QUANTITY: h.quantity ?? "",
  //         "EDITED ON": h.editedOn ? formatDate(h.editedOn) : "",
  //       })),
  //     }));

  //     // Fetch Assets Reports for this vendorId (minimal formatting for consistency, not filtered by DOC DATE)
  //     const assetsReportsRaw = await AssetsReportModel.find({
  //       vlcCode: vendorId,
  //     }).sort({ uploadedOn: -1 });

  //     const assetsReports = assetsReportsRaw.map((report) => ({
  //       "UPLOADED ON": formatDate(report.uploadedOn),
  //       "UPLOADED BY": report.uploadedBy || "",
  //       "VLC CODE": report.vlcCode || "",
  //       "SR NO": report.srNo || "",
  //       "STOCK NO": report.stockNo || "",
  //       RT: report.rt != null ? report.rt : "",
  //       DUPLICATE: report.duplicate != null ? report.duplicate : "",
  //       "VLC NAME": report.vlcName || "",
  //       STATUS: report.status || "",
  //       "C STATUS": report.cStatus || "",
  //       CAN: report.can != null ? report.can : "",
  //       LID: report.lid != null ? report.lid : "",
  //       PVC: report.pvc != null ? report.pvc : "",
  //       DPS: report.dps || "",
  //       KEYBOARD: report.keyboard != null ? report.keyboard : "",
  //       PRINTER: report.printer != null ? report.printer : "",
  //       CHARGER: report.charger != null ? report.charger : "",
  //       STRIPPER: report.stripper != null ? report.stripper : "",
  //       SOLAR: report.solar != null ? report.solar : "",
  //       CONTROLLER: report.controller != null ? report.controller : "",
  //       EWS: report.ews != null ? report.ews : "",
  //       DISPLAY: report.display != null ? report.display : "",
  //       BATTERY: report.battery != null ? report.battery : "",
  //       BOND: report.bond || "",
  //       "VSP SIGN": report.vspSign != null ? report.vspSign : "",
  //       history: (report.history || []).map((h) => ({
  //         "SR NO": h.srNo || "-",
  //         "STOCK NO": h.stockNo || "-",
  //         RT: h.rt ?? "-",
  //         STATUS: h.status ?? "-",
  //         "C STATUS": h.cStatus ?? "-",
  //         CAN: h.can ?? "-",
  //         LID: h.lid ?? "-",
  //         PVC: h.pvc ?? "-",
  //         DPS: h.dps ?? "-",
  //         KEYBOARD: h.keyboard ?? "-",
  //         PRINTER: h.printer ?? "-",
  //         CHARGER: h.charger ?? "-",
  //         STRIPPER: h.stripper ?? "-",
  //         SOLAR: h.solar ?? "-",
  //         CONTROLLER: h.controller ?? "-",
  //         EWS: h.ews ?? "-",
  //         DISPLAY: h.display ?? "-",
  //         BATTERY: h.battery ?? "-",
  //         BOND: h.bond ?? "-",
  //         "VSP SIGN": h.vspSign ?? "-",
  //         "CHANGED ON": h.changedOn ? formatDate(h.changedOn) : "",
  //       })),
  //     }));

  //     return res.status(200).json({
  //       message: "Vendor reports fetched successfully ✅",
  //       vendor: {
  //         id: vendor._id,
  //         vendorId,
  //         name: vendor.name,
  //         email: vendor.email,
  //         phoneNo: vendor.phoneNo,
  //         route: vendor.route,
  //       },
  //       milkReports,
  //       salesReports,
  //       assetsReports,
  //     });
  //   } catch (error) {
  //     console.error("Error in getVendorReportsByVendorId:", error);
  //     return res.status(500).json({ error: "Internal server error" });
  //   }
  // };

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
