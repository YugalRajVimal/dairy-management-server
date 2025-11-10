import express from "express";

import jwtAuth from "../middlewares/Auth/auth.middleware.js";
import { upload } from "../middlewares/fileUpload.middleware.js";
import SupervisorController from "../Controllers/SupervisorController/supervisor.controller.js";

const supervisorRouter = express.Router();

const supervisorController = new SupervisorController();

supervisorRouter.get("/", (req, res) => {
  res.send("Welcome to ABC Company  Admin APIs");
});

supervisorRouter.post("/onboard-vendor", jwtAuth, (req, res) => {
  supervisorController.onboardVendor(req, res);
});

supervisorRouter.get("/get-all-vendors", jwtAuth, (req, res) => {
  supervisorController.getAllVendors(req, res);
});

supervisorRouter.post("/onboard-supervisor", jwtAuth, (req, res) => {
  supervisorController.onboardSupervisor(req, res);
});

supervisorRouter.get("/get-all-supervisors", jwtAuth, (req, res) => {
  supervisorController.getAllSupervisors(req, res);
});

supervisorRouter.post(
  "/upload-excel-file",
  jwtAuth,
  upload.single("file"),
  (req, res) => {
    supervisorController.uploadExcelFile(req, res);
  }
);

supervisorRouter.get("/get-uploaded-milk-report", jwtAuth, (req, res) => {
  supervisorController.getUploadedMilkReport(req, res);
});

supervisorRouter.post(
  "/upload-sales-report",
  jwtAuth,
  upload.single("file"),
  (req, res) => {
    supervisorController.uploadSalesReport(req, res);
  }
);

supervisorRouter.get("/get-uploaded-sales-report", jwtAuth, (req, res) => {
  supervisorController.getUploadedSalesReport(req, res);
});

supervisorRouter.post("/add-sales-report", jwtAuth, (req, res) => {
  supervisorController.addSalesReport(req, res);
});

supervisorRouter.post("/add-assets-report", jwtAuth, (req, res) => {
  supervisorController.addAssetsReport(req, res);
});

supervisorRouter.post("/update-assets-report", jwtAuth, (req, res) => {
  supervisorController.updateAssetsReport(req, res);
});

supervisorRouter.get("/get-assets-report", jwtAuth, (req, res) => {
  supervisorController.getAssetsReport(req, res);
});

supervisorRouter.get("/get-uploaded-assets-report", jwtAuth, (req, res) => {
  supervisorController.getUploadedAssetsReport(req, res);
});

supervisorRouter.get("/get-issued-assets-report", jwtAuth, (req, res) => {
  supervisorController.getIssuedAssetsReport(req, res);
});

export default supervisorRouter;
