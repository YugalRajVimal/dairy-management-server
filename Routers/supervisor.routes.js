import express from "express";

import jwtAuth from "../middlewares/Auth/auth.middleware.js";
import SupervisorController from "../Controllers/SupervisorController/supervisor.controller.js";

const supervisorRouter = express.Router();

const supervisorController = new SupervisorController();

supervisorRouter.get("/", (req, res) => {
  res.send("Welcome to BHOLE BABA MILK FOOD INDUSTRIES DHOLPUR PVT LTD  Supervisor APIs");
});

supervisorRouter.get("/get-profile-details", jwtAuth, (req, res) => {
  supervisorController.getProfileDetails(req, res);
});

supervisorRouter.get("/get-dashboard-details", jwtAuth, (req, res) => {
  supervisorController.getDashboardDetails(req, res);
});

supervisorRouter.get("/get-milk-reports", jwtAuth, (req, res) => {
  supervisorController.getMilkReports(req,res);
});


supervisorRouter.get("/get-all-vendors", jwtAuth, (req, res) => {
  supervisorController.getAllVendors(req, res);
});

supervisorRouter.get("/get-all-vendors-by-routes", jwtAuth, (req, res) => {
  supervisorController.getAllVendorsByRoutes(req, res);
});


supervisorRouter.get("/vendor/:vendorId/reports", jwtAuth, (req, res) => {
  supervisorController.getVendorReportsByVendorId(req, res);
});



// supervisorRouter.get("/get-uploaded-milk-report", jwtAuth, (req, res) => {
//   supervisorController.getUploadedMilkReport(req, res);
// });

// supervisorRouter.get("/get-uploaded-sales-report", jwtAuth, (req, res) => {
//   supervisorController.getUploadedSalesReport(req, res);
// });

// supervisorRouter.get("/get-uploaded-assets-report", jwtAuth, (req, res) => {
//   supervisorController.getUploadedAssetsReport(req, res);
// });



// supervisorRouter.get("/get-assets-report", jwtAuth, (req, res) => {
//   supervisorController.getAssetsReport(req, res);
// });

// supervisorRouter.get("/get-issued-assets-report", jwtAuth, (req, res) => {
//   supervisorController.getIssuedAssetsReport(req, res);
// });

export default supervisorRouter;
