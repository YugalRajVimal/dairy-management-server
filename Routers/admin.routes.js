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

export default adminRouter;
