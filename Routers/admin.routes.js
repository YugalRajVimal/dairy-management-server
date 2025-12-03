import express from "express";
import AdminController from "../Controllers/AdminControllers/admin.controller.js";

import jwtAuth from "../middlewares/Auth/auth.middleware.js";

const adminRouter = express.Router();

const adminController = new AdminController();

adminRouter.get("/", (req, res) => {
  res.send("Welcome to ABC Company  Admin APIs");
});

adminRouter.get("/get-profile-details", jwtAuth, (req, res) => {
  adminController.getProfileDetails(req, res);
});


adminRouter.get("/get-dashboard-details", jwtAuth, (req, res) => {
  adminController.getDashboardDetails(req, res);
});

// Add Route
adminRouter.post("/add-route", jwtAuth, (req, res) => {
  adminController.addRoute(req, res);
});

// Edit Route
adminRouter.put("/edit-route/:id", jwtAuth, (req, res) => {
  adminController.editRoute(req, res);
});

// Delete Route
adminRouter.delete("/delete-route/:id", jwtAuth, (req, res) => {
  adminController.deleteRoute(req, res);
});

// Fetch All Routes
adminRouter.get("/get-all-routes", jwtAuth, (req, res) => {
  adminController.getAllRoutes(req, res);
});



adminRouter.post("/onboard-sub-admin", jwtAuth, (req, res) => {
  adminController.onboardSubAdmin(req, res);
});

adminRouter.put("/update-sub-admin/:id", jwtAuth, (req, res) => {
  adminController.updateSubAdmin(req, res);
});


adminRouter.get("/get-all-sub-admins", jwtAuth, (req, res) => {
  adminController.getAllSubAdmins(req, res);
});

adminRouter.get("/get-all-supervisors", jwtAuth, (req, res) => {
  adminController.getAllSupervisors(req, res);
});

adminRouter.get("/get-all-vendors", jwtAuth, (req, res) => {
  adminController.getAllVendors(req, res);
});

adminRouter.get("/get-issued-assets-report", jwtAuth, (req, res) => {
  adminController.getIssuedAssetsReport(req, res);
});

adminRouter.get("/get-all-issued-assets-report", jwtAuth, (req, res) => {
  adminController.getAllIssuedAssetsReport(req, res);
});

adminRouter.post("/add-issued-assets", jwtAuth, (req, res) => {
  adminController.addIssuedAssets(req, res);
});

adminRouter.post("/update-issued-assets", jwtAuth, (req, res) => {
  adminController.updateIssuedAssets(req, res);
});

export default adminRouter;
