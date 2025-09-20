import express from "express";
import jwtAuth from "../middlewares/Auth/auth.middleware.js";
import VendorController from "../Controllers/VendorControllers/vendor.controller.js";

const vendorRouter = express.Router();

const vendorController = new VendorController();

vendorRouter.get("/profile-details", jwtAuth, (req, res) => {
  vendorController.getVendorProfile(req, res);
});

vendorRouter.get("/get-milk-report", jwtAuth, (req, res) => {
  vendorController.getVendorMilkReport(req, res);
});

vendorRouter.get("/get-sales-report", jwtAuth, (req, res) => {
  vendorController.getVendorSalesReport(req, res);
});

vendorRouter.get("/get-issued-assets", jwtAuth, (req, res) => {
  vendorController.getVendorIssuedItemsWithHistory(req, res);
});

export default vendorRouter;
