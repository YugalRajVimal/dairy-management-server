import express from "express";
import AdminController from "../Controllers/AdminControllers/admin.controller.js";

import jwtAuth from "../middlewares/Auth/auth.middleware.js";

const adminRouter = express.Router();

const adminController = new AdminController();

adminRouter.get("/", (req, res) => {
  res.send("Welcome to ABC Company  Admin APIs");
});

adminRouter.post("/onboard-sub-admin", jwtAuth, (req, res) => {
  adminController.onboardSubAdmin(req, res);
});

adminRouter.get("/get-all-sub-admins", jwtAuth, (req, res) => {
  adminController.getAllSubAdmins(req, res);
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
