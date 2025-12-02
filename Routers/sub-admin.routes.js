import express from "express";

import SubAdminController from "../Controllers/SubAdminController/sub-admin.controller.js";
import jwtAuth from "../middlewares/Auth/auth.middleware.js";
import { upload } from "../middlewares/fileUpload.middleware.js";

const subAdminRouter = express.Router();

const subAdminController = new SubAdminController();

subAdminRouter.get("/", (req, res) => {
  res.send("Welcome to ABC Company  Admin APIs");
});

subAdminRouter.get("/get-profile-details", jwtAuth, (req, res) => {
  subAdminController.getProfileDetails(req, res);
});


subAdminRouter.get("/get-dashboard-details", jwtAuth, (req, res) => {
  subAdminController.getDashboardDetails(req, res);
});


subAdminRouter.post("/onboard-vendor", jwtAuth, (req, res) => {
  subAdminController.onboardVendor(req, res);
});

subAdminRouter.put("/update-vendor/:id", jwtAuth, (req, res) => {
  subAdminController.updateVendor(req, res);
});

subAdminRouter.patch("/enable-disable-vendor/:id", jwtAuth, (req, res) => {
  subAdminController.enableDisableVendor(req, res);
});

subAdminRouter.get("/get-all-vendors", jwtAuth, (req, res) => {
  subAdminController.getAllVendors(req, res);
});

subAdminRouter.get("/get-all-routes", jwtAuth, (req, res) => {
  subAdminController.getAllRoutes(req, res);
});

subAdminRouter.post("/onboard-supervisor", jwtAuth, (req, res) => {
  subAdminController.onboardSupervisor(req, res);
});

subAdminRouter.put("/update-supervisor/:id", jwtAuth, (req, res) => {
  subAdminController.updateSupervisor(req, res);
});


subAdminRouter.get("/get-all-supervisors", jwtAuth, (req, res) => {
  subAdminController.getAllSupervisors(req, res);
});

subAdminRouter.post(
  "/upload-excel-file",
  jwtAuth,
  upload.single("file"),
  (req, res) => {
    subAdminController.uploadExcelFile(req, res);
  }
);

subAdminRouter.post(
  "/manual-milk-report-entry",
  jwtAuth,
  (req, res) => {
    subAdminController.manualMilkReportEntry(req, res);
  }
);


subAdminRouter.get("/get-uploaded-milk-report", jwtAuth, (req, res) => {
  subAdminController.getUploadedMilkReport(req, res);
});

subAdminRouter.put(
  "/update-milk-report/:id",
  jwtAuth,
  (req, res) => {
    subAdminController.updateMilkReport(req, res);
  }
);

// Delete MilkReport record by MilkReportId
subAdminRouter.delete(
  "/delete-milk-report/:id",
  jwtAuth,
  (req, res) => {
    subAdminController.deleteMilkreport(req, res);
  }
);

// Delete SalesReport record by SalesReportId
subAdminRouter.delete(
  "/delete-sales-report/:id",
  jwtAuth,
  (req, res) => {
    subAdminController.deleteSalesreport(req, res);
  }
);




subAdminRouter.post(
  "/upload-sales-report",
  jwtAuth,
  upload.single("file"),
  (req, res) => {
    subAdminController.uploadSalesReport(req, res);
  }
);

subAdminRouter.get("/get-uploaded-sales-report", jwtAuth, (req, res) => {
  subAdminController.getUploadedSalesReport(req, res);
});

subAdminRouter.post("/add-sales-report", jwtAuth, (req, res) => {
  subAdminController.addSalesReport(req, res);
});

subAdminRouter.put(
  "/update-sales-report/:id",
  jwtAuth,
  (req, res) => {
    subAdminController.updateSalesReport(req, res);
  }
);


subAdminRouter.post("/add-assets-report", jwtAuth, (req, res) => {
  subAdminController.addAssetsReport(req, res);
});

subAdminRouter.post("/update-assets-report", jwtAuth, (req, res) => {
  subAdminController.updateAssetsReport(req, res);
});

subAdminRouter.get("/get-assets-report", jwtAuth, (req, res) => {
  subAdminController.getAssetsReport(req, res);
});

subAdminRouter.get("/get-uploaded-assets-report", jwtAuth, (req, res) => {
  subAdminController.getUploadedAssetsReport(req, res);
});

subAdminRouter.get("/get-issued-assets-report", jwtAuth, (req, res) => {
  subAdminController.getIssuedAssetsReport(req, res);
});

export default subAdminRouter;
