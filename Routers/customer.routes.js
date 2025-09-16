import express from "express";
import CustomerAuthController from "../Controllers/CustomerControllers/customer.auth.controller.js";
import jwtAuth from "../middlewares/Auth/auth.middleware.js";
import { upload } from "../middlewares/fileUpload.middleware.js";

const customerRouter = express.Router();

const customerAuthController = new CustomerAuthController();

customerRouter.get("/", (req, res) => {
  res.send("Welcome to ABC Company Customer APIs");
});

customerRouter.post("/auth", jwtAuth, (req, res) => {
  customerAuthController.checkAuth(req, res);
});

customerRouter.post("/signup", (req, res) => {
  customerAuthController.signup(req, res);
});

customerRouter.post("/signin", (req, res) => {
  customerAuthController.signin(req, res);
});

customerRouter.post("/verify-account", (req, res) => {
  customerAuthController.verifyAccount(req, res);
});

customerRouter.post(
  "/registration",
  jwtAuth,
  upload.fields([
    { name: "aadhar", maxCount: 1 },
    { name: "drivingLicense", maxCount: 1 },
    { name: "addressProof", maxCount: 1 },
  ]),
  (req, res) => {
    customerAuthController.registration(req, res);
  }
);

customerRouter.get("/registration-details", jwtAuth, (req, res) => {
  customerAuthController.getRegistrationDetails(req, res);
});

customerRouter.post(
  "/update-profile-details",
  jwtAuth,
  upload.single("profilePicture"),
  (req, res) => {
    customerAuthController.updateProfileDetails(req, res);
  }
);

customerRouter.get("/get-profile-details", jwtAuth, (req, res) => {
  customerAuthController.getProfileDetails(req, res);
});

customerRouter.get("/get-all-packages", (req, res) => {
  customerAuthController.getAllPackages(req, res);
});

customerRouter.post("/purchase-package", jwtAuth, (req, res) => {
  customerAuthController.purchasePackage(req, res);
});

customerRouter.get(
  "/get-subscription-detail/:subscriptionId",
  jwtAuth,
  (req, res) => {
    customerAuthController.getSubscriptionDetail(req, res);
  }
);

customerRouter.get("/get-all-subscription-detail", jwtAuth, (req, res) => {
  customerAuthController.getAllSubscriptionDetails(req, res);
});

customerRouter.get("/get-subscription-history", jwtAuth, (req, res) => {
  customerAuthController.getSubscriptionHistory(req, res);
});

customerRouter.get("/get-wallet-balance", jwtAuth, (req, res) => {
  customerAuthController.getWalletDetails(req, res);
});

customerRouter.post("/add-wallet-balance", jwtAuth, (req, res) => {
  customerAuthController.addAmountToWallet(req, res);
});

customerRouter.get("/get-wallet-history", jwtAuth, (req, res) => {
  customerAuthController.getWalletHistory(req, res);
});

customerRouter.get("/get-transaction-history", jwtAuth, (req, res) => {
  customerAuthController.getTransactionHistory(req, res);
});

customerRouter.post("/logout", (req, res) => {
  customerAuthController.logout(req, res);
});

export default customerRouter;
